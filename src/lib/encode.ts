import { Mp3Encoder } from "@breezystack/lamejs";
import { buildChain, type FxState } from "./audio";

export type Stage = "prepare" | "video" | "audio" | "finalize" | "done";

export interface Progress {
  stage: Stage;
  ratio: number;
}

/**
 * Decodes audio from an input file/blob, slices to trim boundaries,
 * and renders with the full real-time studio chain (Delay, Reverb, Tone, Volume).
 */
export async function renderAudioBuffer(
  fileOrBlob: Blob | File,
  fx: FxState,
  opts: { trimStart: number; trimEnd: number }
): Promise<AudioBuffer> {
  const arrayBuffer = await fileOrBlob.arrayBuffer();

  // Create temporary AudioContext to decode audio data
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const tempCtx = new AC();
  const decoded = await tempCtx.decodeAudioData(arrayBuffer);
  await tempCtx.close().catch(() => {});

  const startSec = Math.max(0, opts.trimStart);
  const endSec = opts.trimEnd > startSec ? opts.trimEnd : decoded.duration;
  const duration = Math.max(0.1, endSec - startSec);

  // Extra tail for delay and reverb tails to fade out naturally
  const tailSec = fx.delay.mix > 0 || fx.reverb.mix > 0 ? 1.5 : 0.2;
  const totalDuration = duration + tailSec;

  const sampleRate = decoded.sampleRate || 44100;
  const lengthSamples = Math.ceil(totalDuration * sampleRate);

  const offlineCtx = new OfflineAudioContext(2, lengthSamples, sampleRate);
  const chain = buildChain(offlineCtx);
  chain.apply(fx);

  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;

  source.connect(chain.input);
  chain.output.connect(offlineCtx.destination);

  // Start source at offset = startSec, for duration
  source.start(0, startSec, duration);

  const renderedBuffer = await offlineCtx.startRendering();
  chain.dispose();

  return renderedBuffer;
}

/**
 * Encodes an AudioBuffer into MP3 format at 192kbps stereo/mono using lamejs.
 */
export function encodeMp3(
  buffer: AudioBuffer,
  onProgress?: (r: number) => void
): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const kbps = 192;

  const encoder = new Mp3Encoder(channels, sampleRate, kbps);
  const mp3Data: Uint8Array[] = [];

  const leftFloat = buffer.getChannelData(0);
  const rightFloat =
    channels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0);

  const totalSamples = buffer.length;
  const leftInt16 = new Int16Array(totalSamples);
  const rightInt16 = new Int16Array(totalSamples);

  // Convert floats [-1.0, 1.0] to signed 16-bit PCM [-32768, 32767]
  for (let i = 0; i < totalSamples; i++) {
    const sL = Math.max(-1, Math.min(1, leftFloat[i]));
    leftInt16[i] = sL < 0 ? sL * 0x8000 : sL * 0x7fff;

    const sR = Math.max(-1, Math.min(1, rightFloat[i]));
    rightInt16[i] = sR < 0 ? sR * 0x8000 : sR * 0x7fff;
  }

  const chunkSize = 1152;
  const numChunks = Math.ceil(totalSamples / chunkSize);

  for (let i = 0; i < totalSamples; i += chunkSize) {
    const end = Math.min(i + chunkSize, totalSamples);
    const leftChunk = leftInt16.subarray(i, end);
    const rightChunk = rightInt16.subarray(i, end);

    let mp3Buf: Uint8Array;
    if (channels === 1) {
      mp3Buf = encoder.encodeBuffer(leftChunk);
    } else {
      mp3Buf = encoder.encodeBuffer(leftChunk, rightChunk);
    }

    if (mp3Buf.length > 0) {
      mp3Data.push(mp3Buf);
    }

    if (onProgress && i % (chunkSize * 16) === 0) {
      onProgress(Math.min(0.98, i / totalSamples));
    }
  }

  const endBuf = encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(endBuf);
  }

  if (onProgress) onProgress(1.0);

  return new Blob(mp3Data as unknown as BlobPart[], { type: "audio/mp3" });
}

/**
 * Renders video with the applied audio effects.
 * Uses MediaRecorder with Canvas Stream + Web Audio Destination to capture
 * synchronized video frames and effected audio, outputting MP4 (or WebM if MP4 unsupported).
 */
export async function renderVideoMp4(
  videoUrl: string,
  fx: FxState,
  onProgress: (p: Progress) => void,
  opts: { trimStart: number; trimEnd: number }
): Promise<{ blob: Blob; ext: string }> {
  onProgress({ stage: "prepare", ratio: 0.1 });

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.src = videoUrl;
  video.playsInline = true;
  video.muted = false;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = (e) => reject(e);
  });

  const duration = video.duration || 10;
  const trimStart = Math.max(0, Math.min(opts.trimStart, duration - 0.1));
  const trimEnd = opts.trimEnd > trimStart ? Math.min(opts.trimEnd, duration) : duration;
  const clipDuration = trimEnd - trimStart;

  onProgress({ stage: "prepare", ratio: 0.3 });

  // Create canvas for rendering video frames
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d")!;

  // Create Web Audio API graph for realtime effect processing during render
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AC({ latencyHint: "interactive" });
  await audioCtx.resume().catch(() => {});

  const mediaSource = audioCtx.createMediaElementSource(video);
  const chain = buildChain(audioCtx);
  chain.apply(fx);

  const audioDest = audioCtx.createMediaStreamDestination();
  mediaSource.connect(chain.input);
  chain.output.connect(audioDest);

  // Combine video stream from canvas with audio stream from effects chain
  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  // Determine export MIME type
  let mimeType = "video/webm;codecs=vp8,opus";
  let ext = "webm";

  const mp4Types = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
  ];
  for (const t of mp4Types) {
    if (MediaRecorder.isTypeSupported(t)) {
      mimeType = t;
      ext = "mp4";
      break;
    }
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 6000000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  onProgress({ stage: "video", ratio: 0.05 });

  video.currentTime = trimStart;
  await new Promise<void>((r) => {
    video.onseeked = () => r();
  });

  return new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
    let animId = 0;
    let completed = false;

    recorder.onstop = () => {
      cancelAnimationFrame(animId);
      chain.dispose();
      audioCtx.close().catch(() => {});
      combinedStream.getTracks().forEach((t) => t.stop());

      onProgress({ stage: "finalize", ratio: 1 });
      const finalBlob = new Blob(chunks, { type: mimeType });
      resolve({ blob: finalBlob, ext });
    };

    recorder.onerror = (e) => {
      cancelAnimationFrame(animId);
      chain.dispose();
      audioCtx.close().catch(() => {});
      reject(e);
    };

    recorder.start(250);

    const finish = () => {
      if (completed) return;
      completed = true;
      video.pause();
      recorder.stop();
    };

    const drawFrame = () => {
      if (completed) return;

      if (!video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      const current = video.currentTime;
      const progress = Math.max(0, Math.min(1, (current - trimStart) / clipDuration));
      onProgress({ stage: "video", ratio: progress });

      if (current >= trimEnd || video.ended) {
        finish();
        return;
      }

      animId = requestAnimationFrame(drawFrame);
    };

    video.onended = () => finish();

    video
      .play()
      .then(() => {
        drawFrame();
      })
      .catch((e) => {
        reject(e);
      });
  });
}
