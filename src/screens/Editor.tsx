import { useEffect, useRef, useState } from "react";
import {
  buildChain,
  readLevel,
  DELAY_PRESETS,
  REVERB_PRESETS,
  type Chain,
  type FxState,
  type MediaKind,
  type Preset,
} from "../lib/audio";
import { Knob, PresetGrid, Sheet, Slider, Waveform, TrimBar } from "../ui/Primitives";
import { C, greenGradient, glowColor } from "../lib/theme";

type Tab = "delay" | "reverb" | "volume" | "trim" | null;

export default function Editor({
  kind,
  url,
  knownDuration,
  fx,
  setFx,
  trim,
  setTrim,
  onBack,
  onExport,
  exporting,
}: {
  kind: MediaKind;
  url: string;
  knownDuration?: number;
  fx: FxState;
  setFx: (f: FxState) => void;
  trim: { start: number; end: number };
  setTrim: (t: { start: number; end: number }) => void;
  onBack: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const elRef = useRef<HTMLVideoElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chainRef = useRef<Chain | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startCtxTime = useRef(0);
  const startOffset = useRef(0);
  const posRef = useRef(0);
  const rafRef = useRef(0);
  const playingRef = useRef(false);

  const [tab, setTab] = useState<Tab>(null);
  const [advanced, setAdvanced] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(() => (knownDuration && knownDuration > 0 ? knownDuration : 0));
  const [getLevel, setGetLevel] = useState<() => number | null>(() => null);
  const trimEnd = trim.end > 0 ? trim.end : dur;
  const trimmed = trim.start > 0.05 || (trim.end > 0 && trim.end < dur - 0.05);

  const trimRef = useRef(trim);
  trimRef.current = trim;

  const setPlay = (v: boolean) => {
    playingRef.current = v;
    setPlaying(v);
  };

  const mediaSrcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const isVideo = kind === "video";

  // ---- build the audio graph ----
  // VIDEO: route the <video> element's own audio through the FX chain. The video
  //        element is the single master clock, so audio & video are ALWAYS in
  //        perfect sync (no drift, no lag).
  // AUDIO-ONLY: decode to a buffer and play it on the audio thread (there's no
  //        video to sync, and this stays perfectly clean).
  useEffect(() => {
    let dead = false;
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // VIDEO: low-latency so the FX audio stays glued to the frames (a big
    // "playback" buffer would delay audio ~150ms behind the video = desync).
    // AUDIO-ONLY: "playback" for a large, glitch-proof buffer.
    const ctx = new AC({ latencyHint: isVideo ? "interactive" : "playback" });
    ctxRef.current = ctx;
    const chain = buildChain(ctx);
    chain.output.connect(ctx.destination);
    chain.apply(fx);
    chainRef.current = chain;
    setGetLevel(() => () => readLevel(chain.analyser));

    if (isVideo) {
      const attach = () => {
        const el = elRef.current;
        if (!el || mediaSrcRef.current) return;
        try {
          const node = ctx.createMediaElementSource(el);
          node.connect(chain.input);
          mediaSrcRef.current = node;
        } catch {
          /* noop */
        }
      };
      // Try attaching immediately and whenever metadata loads
      attach();
      elRef.current?.addEventListener("loadedmetadata", attach, { once: true });
      elRef.current?.addEventListener("canplay", attach, { once: true });

      // Initialize duration accurately
      if (knownDuration && knownDuration > 0) {
        setDur(knownDuration);
        if (trimRef.current.end === 0) setTrim({ start: 0, end: knownDuration });
      } else {
        // Probe audio track for 100% accurate file duration (prevents 3s truncation bug)
        (async () => {
          try {
            const resp = await fetch(url);
            const ab = await resp.arrayBuffer();
            const tempCtx = new (window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext)();
            const buf = await tempCtx.decodeAudioData(ab.slice(0));
            await tempCtx.close().catch(() => {});
            if (dead) return;
            if (buf && buf.duration > 0) {
              setDur((prev) => (prev > 0 ? prev : buf.duration));
              if (trimRef.current.end === 0) {
                setTrim({ start: 0, end: buf.duration });
              }
            }
          } catch {
            /* noop */
          }
        })();
      }
    } else {
      (async () => {
        try {
          const resp = await fetch(url);
          const ab = await resp.arrayBuffer();
          const buf = await ctx.decodeAudioData(ab);
          if (dead) return;
          bufferRef.current = buf;
          posRef.current = 0;
          setDur(buf.duration);
          setTrim({ start: 0, end: buf.duration });
        } catch {
          /* no decodable audio */
        }
      })();
    }

    return () => {
      dead = true;
      clearInterval(rafRef.current);
      try {
        srcRef.current?.stop();
      } catch {
        /* noop */
      }
      srcRef.current = null;
      try {
        mediaSrcRef.current?.disconnect();
      } catch {
        /* noop */
      }
      mediaSrcRef.current = null;
      chain.dispose();
      ctx.close().catch(() => {});
      chainRef.current = null;
      bufferRef.current = null;
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // ---- push fx changes live ----
  useEffect(() => {
    chainRef.current?.apply(fx);
  }, [fx]);

  // ---- stop preview the moment an export starts ----
  useEffect(() => {
    if (exporting && playingRef.current) stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exporting]);

  // video metadata -> real duration
  const onMeta = () => {
    if (!isVideo) return;
    const el = elRef.current;
    if (!el) return;
    const apply = (d: number) => {
      if (!isFinite(d) || d <= 0) return;
      setDur((prev) => (prev > 0 ? prev : d));
      if (trimRef.current.end === 0) setTrim({ start: 0, end: d });
    };
    if (knownDuration && knownDuration > 0) {
      apply(knownDuration);
      return;
    }
    if (isFinite(el.duration) && el.duration > 0) {
      apply(el.duration);
      return;
    }
    if (el.seekable && el.seekable.length > 0) {
      const sEnd = el.seekable.end(el.seekable.length - 1);
      if (isFinite(sEnd) && sEnd > 0) {
        apply(sEnd);
        return;
      }
    }
  };

  const currentPos = () => {
    if (isVideo) return elRef.current?.currentTime ?? posRef.current;
    if (playingRef.current && ctxRef.current) {
      return startOffset.current + (ctxRef.current.currentTime - startCtxTime.current);
    }
    return posRef.current;
  };

  const runLoop = () => {
    clearInterval(rafRef.current);
    rafRef.current = window.setInterval(() => {
      const t = trimRef.current;
      const end = t.end > 0 ? t.end : dur;
      const pos = currentPos();
      if (pos >= end - 0.05) {
        startPlayback(t.start);
        return;
      }
      setTime(pos);
    }, 150);
  };

  const startPlayback = (offset: number) => {
    const ctx = ctxRef.current;
    const chain = chainRef.current;
    if (!ctx || !chain) return;
    ctx.resume().catch(() => {});

    const t = trimRef.current;
    const end = t.end > 0 ? t.end : dur;
    let off = Math.max(t.start, Math.min(offset, Math.max(t.start, end - 0.05)));
    if (!isFinite(off) || off < 0) off = t.start;

    if (isVideo) {
      const el = elRef.current;
      if (el) {
        try {
          el.muted = false;
          el.currentTime = off;
          const p = el.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => {
              // If browser blocked unmuted autoplay, retry
              el.play().catch(() => {});
            });
          }
        } catch {
          /* noop */
        }
      }
      posRef.current = off;
      setPlay(true);
      runLoop();
      return;
    }

    const buf = bufferRef.current;
    if (buf) {
      try {
        srcRef.current?.stop();
      } catch {
        /* noop */
      }
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(chain.input);
      s.start(0, off);
      srcRef.current = s;
    }
    startCtxTime.current = ctx.currentTime;
    startOffset.current = off;
    posRef.current = off;
    setPlay(true);
    runLoop();
  };

  const stopPlayback = () => {
    posRef.current = currentPos();
    if (isVideo) {
      try {
        elRef.current?.pause();
      } catch {
        /* noop */
      }
    } else {
      try {
        srcRef.current?.stop();
      } catch {
        /* noop */
      }
      srcRef.current = null;
    }
    setPlay(false);
    clearInterval(rafRef.current);
  };

  const toggle = () => {
    if (playingRef.current) stopPlayback();
    else startPlayback(posRef.current);
  };

  const seekTo = (tSec: number) => {
    const clamped = Math.max(0, Math.min(dur || tSec, tSec));
    posRef.current = clamped;
    setTime(clamped);
    if (isVideo) {
      const el = elRef.current;
      if (el) {
        try {
          el.currentTime = clamped;
        } catch {
          /* noop */
        }
      }
    }
    if (playingRef.current) startPlayback(clamped);
  };

  const seek = (p: number) => {
    if (dur) seekTo(p * dur);
  };

  const activeDelay =
    DELAY_PRESETS.find(
      (p) =>
        Math.abs((p.values as FxState["delay"]).time - fx.delay.time) < 0.005 &&
        Math.abs((p.values as FxState["delay"]).feedback - fx.delay.feedback) < 0.01 &&
        Math.abs((p.values as FxState["delay"]).mix - fx.delay.mix) < 0.01
    )?.id ?? "custom";

  const activeReverb =
    REVERB_PRESETS.find(
      (p) =>
        Math.abs((p.values as FxState["reverb"]).decay - fx.reverb.decay) < 0.05 &&
        Math.abs((p.values as FxState["reverb"]).mix - fx.reverb.mix) < 0.01
    )?.id ?? "custom";

  const pickDelay = (p: Preset) => setFx({ ...fx, delay: { ...(p.values as FxState["delay"]) } });
  const pickReverb = (p: Preset) => setFx({ ...fx, reverb: { ...(p.values as FxState["reverb"]) } });

  const dbLabel = fx.volume <= 0.001 ? "-∞ dB" : `${(20 * Math.log10(fx.volume)).toFixed(1)} dB`;
  const fmt = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: C.bg }}>
      {/* ---------- realtime preview ---------- */}
      <div
        className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}
      >
        <button
          onClick={onBack}
          disabled={exporting}
          className="flex items-center gap-1 text-[12px] active:scale-95 disabled:opacity-40"
          style={{ color: C.silverDim }}
        >
          ← Retake
        </button>
        <span
          className="text-[10px] uppercase"
          style={{ color: "#5c6b64", letterSpacing: "0.2em" }}
        >
          Live preview
        </span>
      </div>

      <div className="flex min-h-[128px] flex-1 flex-col px-4">
        <div
          className="relative flex min-h-0 flex-1 overflow-hidden rounded-3xl border bg-black"
          style={{ borderColor: C.line, boxShadow: `0 20px 50px -30px ${glowColor(C.greenDeep, 0.9)}` }}
        >
          {kind === "video" ? (
            <video
              ref={elRef}
              src={url}
              playsInline
              webkit-playsinline="true"
              preload="auto"
              crossOrigin="anonymous"
              loop={false}
              className="h-full w-full bg-black object-contain pointer-events-auto"
              onClick={toggle}
              onLoadedMetadata={onMeta}
              onEnded={() => startPlayback(trimRef.current.start)}
            />
          ) : (
            <>
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-4 px-5"
                style={{
                  background: `radial-gradient(circle at 50% 30%, ${glowColor(C.greenDeep, 0.26)} 0%, ${C.bg} 72%)`,
                }}
              >
                <div
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full border"
                  style={{ borderColor: C.line, background: "rgba(199,208,214,0.05)" }}
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.silver}
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  >
                    <path d="M9 18V5l10-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="16" cy="16" r="3" />
                  </svg>
                </div>
                <Waveform get={getLevel} playing={playing} />
                <div className="w-full">
                  <div className="relative h-1.5 w-full rounded-full" style={{ background: "rgba(199,208,214,0.12)" }}>
                    <div
                      className="absolute h-full rounded-full"
                      style={{
                        width: `${dur ? (time / dur) * 100 : 0}%`,
                        background: `linear-gradient(90deg,${C.greenDeep},${C.green})`,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[10px]" style={{ color: "#5c6b64" }}>
                    <span>{fmt(time)}</span>
                    <span>{fmt(dur)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* tap-to-play overlay */}
          <button
            onClick={toggle}
            className={`absolute inset-0 grid place-items-center transition-opacity ${
              playing ? "opacity-0" : "opacity-100"
            }`}
          >
            <span
              className="grid h-14 w-14 place-items-center rounded-full backdrop-blur"
              style={{ background: "rgba(5,11,8,0.55)", border: `1px solid ${C.line}` }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={C.silver}>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        </div>

        {/* seek bar for video */}
        {kind === "video" && dur > 0 && (
          <div className="mt-2 shrink-0 pb-1">
            <div
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seek((e.clientX - r.left) / r.width);
              }}
              className="relative h-1.5 w-full rounded-full"
              style={{ background: "rgba(199,208,214,0.12)" }}
            >
              <div
                className="absolute h-full rounded-full"
                style={{
                  width: `${(time / dur) * 100}%`,
                  background: `linear-gradient(90deg,${C.greenDeep},${C.green})`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ---------- the controls ---------- */}
      <div className="shrink-0 px-4 pt-2.5">
        <div className="grid grid-cols-4 gap-2">
          <FxButton
            title="Delay"
            emoji="◍"
            summary={DELAY_PRESETS.find((p) => p.id === activeDelay)?.name ?? "Custom"}
            color={C.delay}
            on={activeDelay !== "off"}
            onClick={() => setTab("delay")}
          />
          <FxButton
            title="Reverb"
            emoji="◈"
            summary={REVERB_PRESETS.find((p) => p.id === activeReverb)?.name ?? "Custom"}
            color={C.reverb}
            on={activeReverb !== "off"}
            onClick={() => setTab("reverb")}
          />
          <FxButton
            title="Volume"
            emoji="◉"
            summary={dbLabel}
            color={C.volume}
            on={fx.volume > 1.02 || fx.volume < 0.98}
            onClick={() => setTab("volume")}
          />
          <FxButton
            title="Trim"
            emoji="✂️"
            summary={trimmed ? `${fmt(trimEnd - trim.start)}` : "Full"}
            color={C.silver}
            on={trimmed}
            onClick={() => setTab("trim")}
          />
        </div>

        {/* volume swipe bar always visible */}
        <div
          className="mt-3 rounded-3xl border p-3.5"
          style={{ borderColor: C.line, background: "rgba(199,208,214,0.035)" }}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase" style={{ color: "#5c6b64", letterSpacing: "0.2em" }}>
              Volume
            </span>
            <span className="font-mono text-[11px]" style={{ color: C.silver }}>
              {dbLabel}
            </span>
          </div>
          <Slider
            value={fx.volume}
            min={0}
            max={2}
            step={0.01}
            color={C.volume}
            onChange={(v) => setFx({ ...fx, volume: v })}
          />
          <div className="flex justify-between text-[9px]" style={{ color: "#4f5c56" }}>
            <span>mute</span>
            <span>normal</span>
            <span>+6 dB</span>
          </div>
        </div>
      </div>

      {/* ---------- export ---------- */}
      <div
        className="shrink-0 px-4 pt-3"
        style={{ paddingBottom: "max(24px, calc(env(safe-area-inset-bottom, 0px) + 14px))" }}
      >
        <button
          onClick={() => {
            stopPlayback();
            onExport();
          }}
          disabled={exporting}
          className="relative w-full overflow-hidden rounded-2xl py-[15px] text-[15px] font-bold uppercase tracking-[0.12em] transition active:scale-[0.98] disabled:opacity-60"
          style={{
            background: greenGradient,
            color: "#052012",
            border: "1px solid rgba(255,255,255,0.35)",
            boxShadow: `0 12px 34px -10px ${glowColor(C.green, 0.95)}, inset 0 1px 0 rgba(255,255,255,0.5)`,
            animation: exporting ? undefined : "afxPulse 2.4s ease-in-out infinite",
          }}
        >
          {!exporting && (
            <span
              className="pointer-events-none absolute inset-y-0 w-1/3"
              style={{
                background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)",
                animation: "afxSweep 2.4s linear infinite",
              }}
            />
          )}
          <span className="relative flex items-center justify-center gap-2">
            {!exporting && (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 16V4m0 0L7 9m5-5 5 5" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
            )}
            {exporting ? "Rendering…" : `Export ${kind === "video" ? "MP4" : "MP3"}`}
          </span>
        </button>
      </div>

      {/* ---------- delay sheet ---------- */}
      <Sheet open={tab === "delay"} onClose={() => setTab(null)} title="Delay">
        <PresetGrid presets={DELAY_PRESETS} activeId={activeDelay} onPick={pickDelay} color={C.delay} />
        <AdvancedToggle on={advanced} onToggle={() => setAdvanced((a) => !a)} />
        {advanced && (
          <div
            className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border p-4"
            style={{ borderColor: C.line, background: "rgba(199,208,214,0.02)" }}
          >
            <Knob
              label="Time"
              color={C.delay}
              value={fx.delay.time}
              min={0.02}
              max={1.2}
              step={0.01}
              format={(v) => `${Math.round(v * 1000)} ms`}
              onChange={(v) => setFx({ ...fx, delay: { ...fx.delay, time: v } })}
            />
            <Knob
              label="Feedback"
              color={C.delay}
              value={fx.delay.feedback}
              min={0}
              max={0.85}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => setFx({ ...fx, delay: { ...fx.delay, feedback: v } })}
            />
            <Knob
              label="Mix"
              color={C.delay}
              value={fx.delay.mix}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => setFx({ ...fx, delay: { ...fx.delay, mix: v } })}
            />
          </div>
        )}
      </Sheet>

      {/* ---------- reverb sheet ---------- */}
      <Sheet open={tab === "reverb"} onClose={() => setTab(null)} title="Reverb">
        <PresetGrid presets={REVERB_PRESETS} activeId={activeReverb} onPick={pickReverb} color={C.reverb} />
        <AdvancedToggle on={advanced} onToggle={() => setAdvanced((a) => !a)} />
        {advanced && (
          <div
            className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border p-4"
            style={{ borderColor: C.line, background: "rgba(199,208,214,0.02)" }}
          >
            <Knob
              label="Size"
              color={C.reverb}
              value={fx.reverb.decay}
              min={0.2}
              max={5}
              step={0.1}
              format={(v) => `${v.toFixed(1)} s`}
              onChange={(v) => setFx({ ...fx, reverb: { ...fx.reverb, decay: v } })}
            />
            <Knob
              label="Mix"
              color={C.reverb}
              value={fx.reverb.mix}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => setFx({ ...fx, reverb: { ...fx.reverb, mix: v } })}
            />
            <Knob
              label="Tone"
              color={C.reverb}
              value={fx.reverb.tone}
              min={1000}
              max={12000}
              step={100}
              format={(v) => `${(v / 1000).toFixed(1)} kHz`}
              onChange={(v) => setFx({ ...fx, reverb: { ...fx.reverb, tone: v } })}
            />
          </div>
        )}
      </Sheet>

      {/* ---------- volume sheet ---------- */}
      <Sheet open={tab === "volume"} onClose={() => setTab(null)} title="Volume">
        <div className="rounded-2xl border p-5" style={{ borderColor: C.line, background: "rgba(199,208,214,0.02)" }}>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[10px] uppercase" style={{ color: "#5c6b64", letterSpacing: "0.2em" }}>
              Output level
            </span>
            <span className="font-mono text-sm" style={{ color: C.volume }}>
              {dbLabel}
            </span>
          </div>
          <Slider
            value={fx.volume}
            min={0}
            max={2}
            step={0.01}
            color={C.volume}
            onChange={(v) => setFx({ ...fx, volume: v })}
          />
          <div className="mt-2 flex gap-2">
            {[
              { l: "Mute", v: 0 },
              { l: "Soft", v: 0.6 },
              { l: "Normal", v: 1 },
              { l: "Boost", v: 1.5 },
              { l: "Max", v: 2 },
            ].map((p) => (
              <button
                key={p.l}
                onClick={() => setFx({ ...fx, volume: p.v })}
                className="flex-1 rounded-xl border py-2 text-[11px] active:scale-95"
                style={
                  Math.abs(fx.volume - p.v) < 0.02
                    ? { background: silverOn(), borderColor: "transparent", color: "#0a1410" }
                    : { borderColor: C.line, background: "rgba(199,208,214,0.03)", color: C.silverDim }
                }
              >
                {p.l}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-[10px]" style={{ color: "#4f5c56" }}>
          Swipe the bar to level your take. Values above 1 dB add gain.
        </p>
      </Sheet>

      {/* ---------- trim sheet ---------- */}
      <Sheet open={tab === "trim"} onClose={() => setTab(null)} title={kind === "video" ? "Trim video" : "Trim audio"}>
        <div className="rounded-2xl border p-4" style={{ borderColor: C.line, background: "rgba(199,208,214,0.02)" }}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] uppercase" style={{ color: "#5c6b64", letterSpacing: "0.2em" }}>
              Selection
            </span>
            <span className="font-mono text-[12px]" style={{ color: C.silver }}>
              {fmt(trim.start)} – {fmt(trimEnd)} · {fmt(trimEnd - trim.start)}
            </span>
          </div>
          <TrimBar
            duration={dur}
            start={trim.start}
            end={trimEnd}
            playhead={time}
            onChange={(s, e) => {
              setTrim({ start: s, end: e });
              seekTo(s);
            }}
            onScrub={(t) => seekTo(t)}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setTrim({ start: time, end: trimEnd })}
              className="flex-1 rounded-xl border py-2 text-[11px] active:scale-95"
              style={{ borderColor: C.line, background: "rgba(199,208,214,0.03)", color: C.silver }}
            >
              Set start ▸
            </button>
            <button
              onClick={() => setTrim({ start: trim.start, end: time })}
              className="flex-1 rounded-xl border py-2 text-[11px] active:scale-95"
              style={{ borderColor: C.line, background: "rgba(199,208,214,0.03)", color: C.silver }}
            >
              ◂ Set end
            </button>
            <button
              onClick={() => setTrim({ start: 0, end: dur })}
              className="rounded-xl border px-3 py-2 text-[11px] active:scale-95"
              style={{ borderColor: C.line, background: "rgba(199,208,214,0.03)", color: C.silverDim }}
            >
              Reset
            </button>
          </div>
        </div>
        <p className="mt-3 text-center text-[10px]" style={{ color: "#4f5c56" }}>
          Drag the handles or scrub to preview. Only the selected part is exported.
        </p>
      </Sheet>
    </div>
  );
}

function silverOn() {
  return "linear-gradient(180deg,#eef3f5 0%,#c3ccd2 45%,#9aa5ac 100%)";
}

function FxButton({
  title,
  emoji,
  summary,
  color,
  on,
  onClick,
}: {
  title: string;
  emoji: string;
  summary: string;
  color: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 transition-all active:scale-95"
      style={{
        borderColor: on ? "rgba(199,208,214,0.22)" : C.line,
        background: on ? "rgba(199,208,214,0.07)" : "rgba(199,208,214,0.02)",
      }}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-xl text-[15px] transition"
        style={{
          background: on ? color : "rgba(199,208,214,0.06)",
          color: on ? "#06120c" : C.silverDim,
          boxShadow: on ? `0 0 16px ${glowColor(color.startsWith("#") ? color : C.green, 0.45)}` : undefined,
        }}
      >
        {emoji}
      </span>
      <span className="text-[11px] font-semibold" style={{ color: C.silver }}>
        {title}
      </span>
      <span className="max-w-full truncate text-[9px]" style={{ color: "#5c6b64" }}>
        {summary}
      </span>
    </button>
  );
}

function AdvancedToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3"
      style={{ borderColor: C.line, background: "rgba(199,208,214,0.02)" }}
    >
      <span className="text-[12px]" style={{ color: C.silver }}>
        Show advanced knobs
      </span>
      <span
        className="relative h-6 w-11 rounded-full transition-colors"
        style={{ background: on ? C.green : "rgba(199,208,214,0.18)" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
          style={{ left: on ? 22 : 2, background: on ? "#f2f7f4" : "#7d878d" }}
        />
      </span>
    </button>
  );
}
