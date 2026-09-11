export type MediaKind = "video" | "audio";

export interface FxState {
  delay: {
    time: number;
    feedback: number;
    mix: number;
  };
  reverb: {
    decay: number;
    mix: number;
    tone: number;
  };
  volume: number;
}

export const defaultFx: FxState = {
  delay: {
    time: 0.28,
    feedback: 0.35,
    mix: 0,
  },
  reverb: {
    decay: 1.8,
    mix: 0,
    tone: 4500,
  },
  volume: 1.0,
};

export interface Preset {
  id: string;
  name: string;
  sub: string;
  values: FxState["delay"] | FxState["reverb"];
}

export const DELAY_PRESETS: Preset[] = [
  { id: "off", name: "Off", sub: "Dry sound", values: { time: 0.25, feedback: 0, mix: 0 } },
  { id: "slapback", name: "Slapback", sub: "Rockabilly slap", values: { time: 0.09, feedback: 0.15, mix: 0.35 } },
  { id: "subtle", name: "Subtle Echo", sub: "Gentle warmth", values: { time: 0.22, feedback: 0.28, mix: 0.25 } },
  { id: "tape", name: "Tape Echo", sub: "Vintage flutter", values: { time: 0.34, feedback: 0.45, mix: 0.4 } },
  { id: "pingpong", name: "Wide Echo", sub: "Spacious delay", values: { time: 0.48, feedback: 0.55, mix: 0.5 } },
  { id: "space", name: "Cosmic", sub: "Deep reflections", values: { time: 0.72, feedback: 0.7, mix: 0.6 } },
];

export const REVERB_PRESETS: Preset[] = [
  { id: "off", name: "Off", sub: "Dry sound", values: { decay: 1.0, mix: 0, tone: 4500 } },
  { id: "room", name: "Small Room", sub: "Intimate vibe", values: { decay: 0.9, mix: 0.25, tone: 5000 } },
  { id: "plate", name: "Vocal Plate", sub: "Crisp sheen", values: { decay: 1.8, mix: 0.38, tone: 7500 } },
  { id: "hall", name: "Warm Hall", sub: "Concert stage", values: { decay: 2.8, mix: 0.45, tone: 4000 } },
  { id: "cathedral", name: "Cathedral", sub: "Grand sacred space", values: { decay: 4.2, mix: 0.55, tone: 3200 } },
  { id: "cave", name: "Ambient Cave", sub: "Endless tail", values: { decay: 5.0, mix: 0.68, tone: 2200 } },
];

export interface Chain {
  input: GainNode;
  output: GainNode;
  analyser: AnalyserNode;
  apply: (fx: FxState) => void;
  dispose: () => void;
}

/**
 * Generates a realistic algorithmic impulse response for the ConvolverNode.
 */
function createImpulseResponse(
  ctx: BaseAudioContext,
  duration: number,
  toneHz: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * Math.max(0.1, duration)));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  // Tone damping factor
  const dampFactor = Math.min(0.99, Math.max(0.1, toneHz / 20000));

  let lastL = 0;
  let lastR = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Exponential decay envelope
    const envelope = Math.exp(-t / (Math.max(0.1, duration) / 3));

    // White noise
    let whiteL = (Math.random() * 2 - 1) * envelope;
    let whiteR = (Math.random() * 2 - 1) * envelope;

    // Simple single-pole lowpass filter for tone warmness
    lastL = lastL + dampFactor * (whiteL - lastL);
    lastR = lastR + dampFactor * (whiteR - lastR);

    // Initial early reflections
    if (i < 800) {
      if (i % 120 === 0) lastL += 0.3 * envelope;
      if (i % 170 === 0) lastR += 0.3 * envelope;
    }

    left[i] = lastL;
    right[i] = lastR;
  }

  return impulse;
}

export function buildChain(ctx: AudioContext | OfflineAudioContext): Chain {
  const input = ctx.createGain();
  const dryGain = ctx.createGain();
  const wetDelayGain = ctx.createGain();
  const wetReverbGain = ctx.createGain();
  const masterVolumeGain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.6;

  // Delay path
  const delayNode = ctx.createDelay(2.0);
  const feedbackGain = ctx.createGain();
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 4000;

  input.connect(dryGain);

  // Input -> Delay -> DelayFilter -> WetDelayGain
  input.connect(delayNode);
  delayNode.connect(delayFilter);
  delayFilter.connect(wetDelayGain);

  // Feedback loop: DelayFilter -> FeedbackGain -> Delay
  delayFilter.connect(feedbackGain);
  feedbackGain.connect(delayNode);

  // Reverb path
  const convolver = ctx.createConvolver();
  const reverbFilter = ctx.createBiquadFilter();
  reverbFilter.type = "lowpass";

  input.connect(convolver);
  convolver.connect(reverbFilter);
  reverbFilter.connect(wetReverbGain);

  // Mix to master volume
  dryGain.connect(masterVolumeGain);
  wetDelayGain.connect(masterVolumeGain);
  wetReverbGain.connect(masterVolumeGain);

  masterVolumeGain.connect(analyser);

  let currentDecay = -1;
  let currentTone = -1;

  function apply(fx: FxState) {
    const now = ctx.currentTime;

    // Volume
    masterVolumeGain.gain.setValueAtTime(Math.max(0, fx.volume), now);

    // Delay
    const delayTime = Math.max(0.01, Math.min(1.5, fx.delay.time));
    const feedback = Math.max(0, Math.min(0.85, fx.delay.feedback));
    const delayMix = Math.max(0, Math.min(1, fx.delay.mix));

    delayNode.delayTime.setValueAtTime(delayTime, now);
    feedbackGain.gain.setValueAtTime(feedback, now);
    wetDelayGain.gain.setValueAtTime(delayMix, now);

    // Reverb
    const revDecay = Math.max(0.2, Math.min(6.0, fx.reverb.decay));
    const revMix = Math.max(0, Math.min(1, fx.reverb.mix));
    const revTone = Math.max(800, Math.min(16000, fx.reverb.tone));

    wetReverbGain.gain.setValueAtTime(revMix, now);
    reverbFilter.frequency.setValueAtTime(revTone, now);

    // Re-generate impulse response if decay changed noticeably
    if (
      Math.abs(currentDecay - revDecay) > 0.1 ||
      Math.abs(currentTone - revTone) > 300
    ) {
      try {
        convolver.buffer = createImpulseResponse(ctx, revDecay, revTone);
        currentDecay = revDecay;
        currentTone = revTone;
      } catch {
        /* noop */
      }
    }

    // Dry gain scales down slightly when wet mix is heavy
    const totalWet = Math.min(1, delayMix * 0.5 + revMix * 0.5);
    dryGain.gain.setValueAtTime(Math.max(0.2, 1 - totalWet * 0.4), now);
  }

  return {
    input,
    output: masterVolumeGain,
    analyser,
    apply,
    dispose: () => {
      try {
        input.disconnect();
        dryGain.disconnect();
        delayNode.disconnect();
        feedbackGain.disconnect();
        delayFilter.disconnect();
        wetDelayGain.disconnect();
        convolver.disconnect();
        reverbFilter.disconnect();
        wetReverbGain.disconnect();
        masterVolumeGain.disconnect();
        analyser.disconnect();
      } catch {
        /* noop */
      }
    },
  };
}

export function readLevel(analyser: AnalyserNode | null): number {
  if (!analyser) return 0;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  const avg = sum / data.length;
  return Math.min(1, avg / 128);
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
