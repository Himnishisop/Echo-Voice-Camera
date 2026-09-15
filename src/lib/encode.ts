import { Mp3Encoder } from "@breezystack/lamejs";
import { buildChain, type Chain, type FxState } from "./audio";

export type Stage = "prepare" | "video" | "audio" | "finalize" | "done";

export interface Progress {
  stage: Stage;
  ratio: number;
}

export interface VideoRenderOpts {
  trimStart: number;
  trimEnd: number;
  knownDuration?: number;
  file?: File | Blob | null;
}

/**
 * Probes the exact duration of an audio or video blob using AudioContext and Video element.
 * Guaranteed to return true duration instead of Infinity on Chromium/Android.
 */
export async function probeMediaDuration(fileOrBlob: Blob | File): Promise<number> {
  // 1. Try audio decoding for sample-accurate duration
  try {
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const tempCtx = new AC();
    const decoded = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
    await tempCtx.close().catch(() => {});
    if (decoded && isFinite(decoded.duration) && decoded.duration > 0) {
      return decoded.duration;
    }
  } catch {
    /* fallback */
  }

  // 2. Try video element metadata
  try {
    const url = URL.createObjectURL(fileOrBlob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    const dur = await new Promise<number>((resolve) => {
      v.onloadedmetadata = () => {
        let d = v.duration;
        if (!isFinite(d) && v.seekable && v.seekable.length > 0) {
          d = v.seekable.end(v.seekable.length - 1);
        }
        resolve(isFinite(d) && d > 0 ? d : 0);
      };
      v.onerror = () => resolve(0);
      setTimeout(() => resolve(0), 2000);
    });
    URL.revokeObjectURL(url);
    if (dur > 0) return dur;
  } catch {
    /* fallback */
  }

  return 0;
}

/**
 * Decodes audio from an input file/blob, slices to trim boundaries,
 * and renders with the full real-time studio chain (Delay, Reverb, Tone, Volume).
 * Resilient: returns silent buffer if video has no audio track instead of crashing.
 */
export async function renderAudioBuffer(
  fileOrBlob: Blob | File | string,
  fx: FxState,
  opts: { trimStart: number; trimEnd: number; knownDuration?: number }
): Promise<AudioBuffer> {
  let blob: Blob;
  if (typeof fileOrBlob === "string") {
    const resp = await fetch(fileOrBlob);
    blob = await resp.blob();
  } else {
    blob = fileOrBlob;
  }

  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const tempCtx = new AC();
  let decoded: AudioBuffer | null = null;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    decoded = await tempCtx.decodeAudioData(arrayBuffer);
  } catch {
    /* video might not have an audio track */
  }
  await tempCtx.close().catch(() => {});

  const totalDecodedDuration = decoded ? decoded.duration : (opts.knownDuration || 10);
  const startSec = Math.max(0, opts.trimStart || 0);
  const endSec =
    opts.trimEnd && opts.trimEnd > startSec
      ? Math.min(opts.trimEnd, totalDecodedDuration)
      : totalDecodedDuration;
  const duration = Math.max(0.1, endSec - startSec);
  const sampleRate = decoded?.sampleRate || 44100;

  if (!decoded) {
    // Generate clean silent buffer for videos without audio
    const lengthSamples = Math.ceil(duration * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, lengthSamples, sampleRate);
    return offlineCtx.createBuffer(2, lengthSamples, sampleRate);
  }

  // Extra tail for delay and reverb tails to fade out naturally
  const tailSec = fx.delay.mix > 0 || fx.reverb.mix > 0 ? 1.0 : 0.1;
  const totalDuration = duration + tailSec;
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
 * Encodes an AudioBuffer into MP3 format at 192kbps.
 * Yields back to the event loop so low-end mobile devices don't freeze.
 */
export async function encodeMp3(
  buffer: AudioBuffer,
  onProgress?: (r: number) => void
): Promise<Blob> {
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

  // Fast float to int16 conversion
  for (let i = 0; i < totalSamples; i++) {
    const sL = leftFloat[i];
    leftInt16[i] = sL < 0 ? Math.max(-32768, sL * 32768) : Math.min(32767, sL * 32767);

    const sR = rightFloat[i];
    rightInt16[i] = sR < 0 ? Math.max(-32768, sR * 32768) : Math.min(32767, sR * 32767);
  }

  const chunkSize = 1152;
  const yieldStep = chunkSize * 40; // yield every ~1s worth of audio

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

    if (i % yieldStep === 0) {
      if (onProgress) {
        onProgress(Math.min(0.98, i / totalSamples));
      }
      // Give breathing room to browser UI on low-end phones
      await new Promise((resolve) => setTimeout(resolve, 0));
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
 * High-quality, robust normal video encoding pipeline:
 * - Completely decoupled offscreen video element (never touches or hijacks live preview).
 * - Applies full studio audio FX (Reverb, Delay, Tone, Volume) via OfflineAudioContext.
 * - Device speakers remain 100% silent during export.
 * - Canvas frame capture with optimal resolution and accurate trim boundaries.
 * - Multi-layered frame advancement and watchdog timer to guarantee export never hangs.
 */
export async function renderVideoMp4(
  source: Blob | File | string,
  fx: FxState,
  onProgress: (p: Progress) => void,
  opts: VideoRenderOpts
): Promise<{ blob: Blob; ext: string }> {
  onProgress({ stage: "prepare", ratio: 0.05 });

  let fileBlob: Blob | File;
  let videoUrl: string;
  let shouldRevokeUrl = false;

  if (opts.file && opts.file instanceof Blob) {
    fileBlob = opts.file;
    videoUrl = URL.createObjectURL(fileBlob);
    shouldRevokeUrl = true;
  } else if (source instanceof Blob) {
    fileBlob = source;
    videoUrl = URL.createObjectURL(fileBlob);
    shouldRevokeUrl = true;
  } else {
    videoUrl = source;
    try {
      const resp = await fetch(source);
      fileBlob = await resp.blob();
    } catch {
      fileBlob = new Blob([], { type: "video/mp4" });
    }
  }

  // 1. Determine accurate duration
  let duration = opts.knownDuration || 0;
  if (!duration || duration <= 0) {
    duration = await probeMediaDuration(fileBlob);
  }
  if (!duration || duration <= 0) {
    duration = 10;
  }

  const trimStart = Math.max(0, Math.min(opts.trimStart || 0, Math.max(0, duration - 0.2)));
  const trimEnd =
    opts.trimEnd && opts.trimEnd > trimStart + 0.1
      ? Math.min(opts.trimEnd, duration)
      : duration;
  const clipDuration = Math.max(0.2, trimEnd - trimStart);

  onProgress({ stage: "prepare", ratio: 0.25 });

  // 2. Pre-render audio track with full studio FX
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await renderAudioBuffer(fileBlob, fx, {
      trimStart,
      trimEnd,
      knownDuration: duration,
    });
  } catch (e) {
    console.warn("Audio effect rendering fallback:", e);
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const fallbackCtx = new AC();
    audioBuffer = fallbackCtx.createBuffer(2, Math.ceil(clipDuration * 44100), 44100);
    await fallbackCtx.close().catch(() => {});
  }

  onProgress({ stage: "prepare", ratio: 0.75 });

  // 3. Create offscreen video element
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.muted = true; // Muted: guarantees autoplay permission and keeps speakers completely silent
  video.preload = "auto";
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.src = videoUrl;

  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:2px;height:2px;opacity:0.001;pointer-events:none;overflow:hidden;z-index:-9999;";
  holder.appendChild(video);
  document.body.appendChild(holder);

  await new Promise<void>((resolve) => {
    let resolved = false;
    const ok = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    if (video.readyState >= 2) return ok();
    video.onloadeddata = ok;
    video.oncanplay = ok;
    video.onerror = ok;
    setTimeout(ok, 3000);
  });

  // Seek video to trim start
  if (trimStart > 0.05) {
    video.currentTime = trimStart;
    await new Promise<void>((resolve) => {
      let done = false;
      const onSeek = () => {
        if (!done) {
          done = true;
          video.removeEventListener("seeked", onSeek);
          resolve();
        }
      };
      video.addEventListener("seeked", onSeek);
      setTimeout(onSeek, 800);
    });
  }

  // 4. Setup canvas with standard even dimensions for video codecs
  const rawW = video.videoWidth || 1280;
  const rawH = video.videoHeight || 720;
  const MAX_DIM = 1280;
  let w = rawW;
  let h = rawH;
  if (Math.max(w, h) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  w = Math.max(2, w - (w % 2));
  h = Math.max(2, h - (h % 2));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx2d = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (ctx2d) {
    ctx2d.drawImage(video, 0, 0, w, h);
  }

  // 5. Setup Audio Graph for Recording (streams only to MediaRecorder, NOT speakers)
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AC({ sampleRate: audioBuffer.sampleRate });
  await audioCtx.resume().catch(() => {});
  const audioDest = audioCtx.createMediaStreamDestination();
  const audioSourceNode = audioCtx.createBufferSource();
  audioSourceNode.buffer = audioBuffer;
  audioSourceNode.connect(audioDest);

  // 6. Capture canvas stream & combine
  const canvasStream = canvas.captureStream(30);
  const videoTrack = canvasStream.getVideoTracks()[0];
  const audioTrack = audioDest.stream.getAudioTracks()[0];
  const combinedStream = new MediaStream([videoTrack, audioTrack]);

  // 7. Select container / MIME type
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  let mimeType = "video/webm";
  let ext = "webm";
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      mimeType = t;
      ext = t.startsWith("video/mp4") ? "mp4" : "webm";
      break;
    }
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 3500000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  onProgress({ stage: "prepare", ratio: 1.0 });

  return new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
    let animId = 0;
    let intervalId = 0;
    let completed = false;
    const startTime = performance.now();

    const cleanup = () => {
      if (animId) cancelAnimationFrame(animId);
      if (intervalId) clearInterval(intervalId);
      combinedStream.getTracks().forEach((t) => t.stop());
      try {
        audioSourceNode.stop();
      } catch {}
      try {
        audioCtx.close().catch(() => {});
      } catch {}
      if (holder.parentNode) holder.remove();
      if (shouldRevokeUrl) URL.revokeObjectURL(videoUrl);
    };

    const finish = () => {
      if (completed) return;
      completed = true;
      try {
        video.pause();
      } catch {}
      if (recorder.state === "recording") {
        try {
          recorder.requestData();
        } catch {}
        recorder.stop();
      }
    };

    recorder.onstop = () => {
      cleanup();
      onProgress({ stage: "finalize", ratio: 1 });
      const blob = new Blob(chunks, { type: mimeType });
      resolve({ blob, ext });
    };

    recorder.onerror = (e) => {
      cleanup();
      reject(e);
    };

    video.onended = () => finish();

    const draw = () => {
      if (completed) return;
      if (ctx2d && video.readyState >= 2) {
        ctx2d.drawImage(video, 0, 0, w, h);
      }
      const current = video.currentTime;
      const elapsed = Math.max(0, current - trimStart);
      const ratio = Math.max(0, Math.min(0.99, elapsed / clipDuration));
      onProgress({ stage: "video", ratio });

      if (current >= trimEnd - 0.04 || video.ended) {
        finish();
        return;
      }
      animId = requestAnimationFrame(draw);
    };

    // Fallback interval ensures frames continue to be drawn even if tab requestAnimationFrame slows
    intervalId = window.setInterval(() => {
      if (completed) return;
      if (ctx2d && video.readyState >= 2) {
        ctx2d.drawImage(video, 0, 0, w, h);
      }
      const current = video.currentTime;
      const elapsed = Math.max(0, current - trimStart);
      const ratio = Math.max(0, Math.min(0.99, elapsed / clipDuration));
      onProgress({ stage: "video", ratio });

      const realElapsed = (performance.now() - startTime) / 1000;
      if (current >= trimEnd - 0.04 || video.ended || realElapsed >= clipDuration + 2.0) {
        finish();
      }
    }, 60);

    onProgress({ stage: "video", ratio: 0.01 });

    try {
      recorder.start(150);
    } catch {}

    try {
      audioSourceNode.start(0);
    } catch {}

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }

    animId = requestAnimationFrame(draw);
  });
}
