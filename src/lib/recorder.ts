import type { MediaKind } from "./audio";

export const QUALITY_LADDER = [720, 1080, 1440, 2160];

export type FacingMode = "user" | "environment";

export interface Recording {
  kind: MediaKind;
  file: File | Blob;
  url: string;
  duration: number;
  lossless: boolean;
}

export class Recorder {
  stream: MediaStream | null = null;
  analyser: AnalyserNode | null = null;
  audioCtx: AudioContext | null = null;
  mediaRecorder: MediaRecorder | null = null;
  chunks: Blob[] = [];
  startTime = 0;
  mode: MediaKind = "video";
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  get elapsed(): number {
    return this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0;
  }

  async start(
    mode: MediaKind,
    options: { facing: FacingMode; maxHeight: number }
  ): Promise<void> {
    this.mode = mode;
    this.cancel();

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
      },
    };

    if (mode === "video") {
      constraints.video = {
        facingMode: options.facing,
        height: { ideal: options.maxHeight },
      };
    } else {
      constraints.video = false;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error("Camera / mic access not supported in this browser context.");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      // Retry with relaxed constraints for devices that reject strict sampleRate/echoCancellation
      const fallbackConstraints: MediaStreamConstraints = {
        audio: true,
        video:
          mode === "video"
            ? { facingMode: options.facing }
            : false,
      };
      this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
    }

    // Set up audio analyser for live meter
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioCtx = new AC();
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.sourceNode.connect(this.analyser);
    } catch (e) {
      console.warn("Could not create live audio analyser", e);
    }
  }

  maxCapableHeight(): number {
    if (!this.stream) return 1080;
    const videoTrack = this.stream.getVideoTracks()[0];
    if (!videoTrack) return 1080;
    const settings = videoTrack.getSettings?.();
    if (settings && settings.height) {
      return settings.height;
    }
    return 1080;
  }

  async beginRecording(): Promise<void> {
    if (!this.stream) {
      throw new Error("No active stream to record");
    }

    this.chunks = [];
    let mimeType = "";

    if (this.mode === "video") {
      const candidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      for (const t of candidates) {
        if (MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }
    } else {
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ];
      for (const t of candidates) {
        if (MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }
    }

    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.startTime = Date.now();
    this.mediaRecorder.start(250); // slices every 250ms
  }

  stop(): Promise<Recording> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        reject(new Error("MediaRecorder not recording"));
        return;
      }

      const dur = this.elapsed;

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || (this.mode === "video" ? "video/webm" : "audio/webm");
        const blob = new Blob(this.chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const fileName = `take-${Date.now()}.${this.mode === "video" ? "webm" : "webm"}`;
        const file = new File([blob], fileName, { type: mimeType });

        this.cancel();
        resolve({
          kind: this.mode,
          file,
          url,
          duration: dur,
          lossless: false,
        });
      };

      this.mediaRecorder.stop();
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* noop */
      }
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.startTime = 0;

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        /* noop */
      }
      this.sourceNode = null;
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        /* noop */
      }
      this.audioCtx = null;
      this.analyser = null;
    }
  }
}
