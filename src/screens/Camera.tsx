import { useEffect, useRef, useState, useCallback } from "react";
import { Recorder, QUALITY_LADDER, type Recording, type FacingMode } from "../lib/recorder";
import { LevelMeter } from "../ui/Primitives";
import { readLevel } from "../lib/audio";
import type { MediaKind } from "../lib/audio";
import type { UserProfile } from "../lib/auth";
import { C, greenGradient, glowColor } from "../lib/theme";

export default function Camera({
  onCapture,
  onImport,
  onOpenAndroid,
  user,
  onSignOut,
  pro,
  onOpenPaywall,
}: {
  onCapture: (r: Recording) => void;
  onImport: () => void;
  onOpenAndroid?: () => void;
  user?: UserProfile | null;
  onSignOut?: () => void;
  pro?: boolean;
  onOpenPaywall?: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const rec = useRef<Recorder | null>(null);
  const timer = useRef<number | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  const [mode, setMode] = useState<MediaKind>("video");
  const [armed, setArmed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState("");
  const [getLevel, setGetLevel] = useState<() => number | null>(() => null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [facing, setFacing] = useState<FacingMode>("user");
  // default 1080p — smooth on low-end phones. "Max" & higher are opt-in.
  const [maxHeight, setMaxHeight] = useState<number>(1080);
  const [qualityOptions, setQualityOptions] = useState<number[]>([]);
  const [qualityOpen, setQualityOpen] = useState(false);

  const clearTimer = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  // (re)arm the camera preview for the current facing + quality
  const arm = useCallback(async () => {
    if (mode !== "video" || recording) return;
    rec.current?.cancel();
    rec.current = null;
    setArmed(false);
    const r = new Recorder();
    try {
      await r.start("video", { facing, maxHeight });
      rec.current = r;
      setArmed(true);
      setStream(r.stream);
      setGetLevel(() => () => (r.analyser ? readLevel(r.analyser) : null));
      // build quality menu from the camera's real max capability
      const cap = r.maxCapableHeight();
      const opts = QUALITY_LADDER.filter((h) => h <= cap + 1);
      setQualityOptions(opts.length ? opts : [cap]);
      setErr("");
    } catch {
      setErr("Camera permission needed. You can still import a file.");
    }
  }, [mode, recording, facing, maxHeight]);

  useEffect(() => {
    if (mode === "video" && !recording) {
      arm();
    } else if (mode === "audio") {
      // release the camera when switching to audio mode
      rec.current?.cancel();
      rec.current = null;
      setArmed(false);
      setStream(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, facing, maxHeight]);

  // attach live stream to the preview element
  useEffect(() => {
    const v = previewRef.current;
    if (v && v.srcObject !== stream) {
      v.srcObject = stream;
      if (stream) v.play().catch(() => {});
    }
  }, [stream]);

  useEffect(
    () => () => {
      clearTimer();
      rec.current?.cancel();
    },
    []
  );

  const start = async () => {
    setErr("");
    clearTimer();
    setQualityOpen(false);
    // reuse the already-armed camera for video; (re)acquire for audio
    if (mode === "video" && rec.current && armed) {
      const r = rec.current;
      try {
        // start recording on the existing stream
        await r.beginRecording();
        setRecording(true);
        setElapsed(0);
        timer.current = window.setInterval(() => setElapsed(r.elapsed), 500);
        return;
      } catch {
        /* fall through to fresh acquire */
      }
    }
    const r = new Recorder();
    try {
      await r.start(mode, { facing, maxHeight });
      await r.beginRecording();
      rec.current = r;
      setGetLevel(() => () => (r.analyser ? readLevel(r.analyser) : null));
      if (mode === "video") setStream(r.stream);
      setRecording(true);
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed(r.elapsed), 500);
    } catch {
      setErr("Mic/camera blocked. Allow access or import a file instead.");
    }
  };

  const stop = async () => {
    clearTimer();
    const r = rec.current;
    if (!r) return;
    setRecording(false);
    try {
      const take = await r.stop();
      rec.current = null;
      onCapture(take);
    } catch {
      setErr("Recording failed, try again.");
      r.cancel();
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const qualityLabel = (h: number) =>
    h >= 2160 ? "4K" : h >= 1440 ? "2K" : `${h}p`;
  const currentQualityLabel = qualityLabel(maxHeight);

  return (
    <div className="flex h-full flex-col" style={{ background: C.bg }}>
      {/* ---------- top actions ---------- */}
      <div
        className="flex items-center gap-2 px-4 pb-2"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}
      >
        <button
          onClick={onImport}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border py-2.5 text-[12px] font-medium backdrop-blur active:scale-[0.97]"
          style={{ borderColor: C.line, background: "rgba(199,208,214,0.07)", color: C.silver }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 16V4m0 0L7 9m5-5 5 5" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Import
        </button>
        <button
          onClick={() => setMode((m) => (m === "video" ? "audio" : "video"))}
          className="flex items-center justify-center gap-2 rounded-full border py-2.5 pl-3 pr-4 text-[12px] font-medium backdrop-blur transition active:scale-[0.97]"
          style={{
            borderColor: mode === "audio" ? glowColor(C.green, 0.5) : C.line,
            background: mode === "audio" ? glowColor(C.greenDeep, 0.28) : "rgba(199,208,214,0.07)",
            color: mode === "audio" ? "#8ff0bd" : C.silver,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
          </svg>
          {mode === "audio" ? "Audio" : "Video"}
        </button>
        {onOpenAndroid && (
          <button
            onClick={onOpenAndroid}
            title="Install or Export Android App"
            className="flex items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-[12px] font-medium backdrop-blur transition active:scale-[0.97]"
            style={{
              borderColor: "rgba(57,255,135,0.3)",
              background: "rgba(57,255,135,0.08)",
              color: "#39ff87",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9992.4482.9992.9993 0 .5511-.4482.9997-.9992.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.996-3.4572a.416.416 0 00-.1523-.5676.416.416 0 00-.5676.1523l-2.0223 3.503C15.5842 8.4116 13.8504 8 12 8s-3.5842.4116-5.1353.9519L4.8424 5.4489a.4161.4161 0 00-.5677-.1523.4157.4157 0 00-.1522.5676l1.996 3.4572C2.6889 11.1867.3333 14.58.3333 18.5h23.3334c0-3.92-2.3556-7.3133-5.7867-9.1786" />
            </svg>
            <span>Android</span>
          </button>
        )}

        {/* User Account / Profile */}
        <button
          onClick={() => setProfileOpen(true)}
          title={user ? user.name : "Sign In"}
          className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border backdrop-blur transition active:scale-95"
          style={{
            borderColor: pro ? "#39ff87" : C.line,
            background: "rgba(199,208,214,0.08)",
          }}
        >
          {user?.picture ? (
            <img src={user.picture} alt={user.name} className="h-full w-full object-cover" />
          ) : user ? (
            <span className="text-xs font-bold uppercase text-white">
              {user.name.slice(0, 1)}
            </span>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.silver} strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
          {pro && (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#39ff87] ring-1 ring-black" />
          )}
        </button>
      </div>

      {/* ---------- stage ---------- */}
      <div className="relative mt-3 flex-1 overflow-hidden">
        {mode === "video" ? (
          <video
            ref={previewRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-contain"
            // RAW, un-mirrored preview so what you see == what is recorded/exported
            style={{ transform: "none", opacity: armed || recording ? 1 : 0.15 }}
          />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-8 px-8"
            style={{
              background: `radial-gradient(circle at 50% 35%, ${glowColor(C.greenDeep, 0.28)} 0%, ${C.bg} 70%)`,
            }}
          >
            <div
              className="grid h-28 w-28 place-items-center rounded-full border transition-all duration-300"
              style={{
                borderColor: recording ? glowColor(C.green, 0.6) : C.line,
                background: recording ? glowColor(C.greenDeep, 0.25) : "rgba(199,208,214,0.04)",
                transform: recording ? "scale(1.1)" : undefined,
                boxShadow: recording ? `0 0 40px -8px ${glowColor(C.green, 0.6)}` : undefined,
              }}
            >
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={recording ? "#6ee7a5" : C.silverDim} strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
              </svg>
            </div>
            <LevelMeter get={getLevel} active={recording || mode === "audio"} />
            <p className="text-center text-[11px]" style={{ color: "#5c6b64" }}>
              48kHz stereo · clean capture
            </p>
          </div>
        )}

        {/* right-side controls: switch cam + quality (video only) */}
        {mode === "video" && (
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
            <button
              onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
              disabled={recording}
              className="grid h-10 w-10 place-items-center rounded-full border backdrop-blur active:scale-95 disabled:opacity-40"
              style={{ borderColor: C.line, background: "rgba(10,20,40,0.55)", color: C.silver }}
              title="Switch camera"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l2-2h6l1 1" />
                <path d="M14 19h6a2 2 0 0 0 2-2V9" />
                <path d="M18 5l3 3-3 3" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>

            <div className="relative">
              <button
                onClick={() => setQualityOpen((o) => !o)}
                disabled={recording}
                className="flex h-10 items-center gap-1 rounded-full border px-3 text-[12px] font-semibold backdrop-blur active:scale-95 disabled:opacity-40"
                style={{ borderColor: C.line, background: "rgba(10,20,40,0.55)", color: C.silver }}
              >
                {currentQualityLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {qualityOpen && (
                <div
                  className="absolute right-0 top-11 z-10 w-32 overflow-hidden rounded-xl border backdrop-blur"
                  style={{ borderColor: C.line, background: "rgba(10,20,40,0.92)" }}
                >
                  {qualityOptions.map((h) => (
                    <button
                      key={h}
                      onClick={() => {
                        setMaxHeight(h);
                        setQualityOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-[12px] active:bg-white/5"
                      style={{ color: maxHeight === h ? C.green : C.silver }}
                    >
                      <span>
                        {qualityLabel(h)}
                        {h > 1080 ? "  ·  heavy" : h === 1080 ? "  ·  smooth" : ""}
                      </span>
                      {maxHeight === h && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* recording HUD */}
        {recording && (
          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-[12px] text-white">{fmt(elapsed)}</span>
          </div>
        )}

        {mode === "video" && !armed && !recording && !err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a1633]/80 p-6 text-center backdrop-blur-sm">
            <div className="grid h-20 w-20 place-items-center rounded-3xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_30px_rgba(57,255,135,0.2)]">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Starting Camera Viewfinder</h3>
              <p className="mt-1 text-xs text-slate-400">Please allow camera and mic permissions when prompted</p>
            </div>
            <button
              onClick={arm}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-5 py-2.5 text-xs font-semibold text-emerald-300 transition active:scale-95"
            >
              <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
              Tap to Enable Camera
            </button>
          </div>
        )}

        {err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a1633]/90 p-6 text-center backdrop-blur-md">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/15 text-amber-400">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="max-w-xs">
              <h4 className="text-sm font-semibold text-white">Camera Access Needed</h4>
              <p className="mt-1 text-xs text-slate-400">{err}</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-[240px]">
              <button
                onClick={arm}
                className="w-full rounded-xl bg-emerald-400 py-2.5 text-xs font-bold text-slate-950 transition active:scale-95"
              >
                Allow / Retry Camera
              </button>
              <button
                onClick={() => setMode("audio")}
                className="w-full rounded-xl border border-white/20 bg-white/5 py-2.5 text-xs font-medium text-white transition active:scale-95"
              >
                Switch to Audio Mode
              </button>
              <button
                onClick={onImport}
                className="w-full rounded-xl border border-white/10 py-2 text-xs text-slate-400 transition active:scale-95"
              >
                Or Import a File
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- record button ---------- */}
      <div
        className="flex flex-col items-center gap-2 pt-3"
        style={{
          background: C.bg,
          paddingBottom: "max(32px, calc(env(safe-area-inset-bottom, 0px) + 16px))",
        }}
      >
        <button
          onClick={recording ? stop : start}
          className="grid h-[74px] w-[74px] place-items-center rounded-full border-[3px] transition active:scale-95"
          style={{ borderColor: "rgba(199,208,214,0.28)" }}
        >
          {recording ? (
            <span
              className="h-6 w-6 rounded-[6px] transition-all duration-200"
              style={{ background: C.rec, boxShadow: `0 0 24px ${C.rec}99` }}
            />
          ) : (
            <span
              className="h-[58px] w-[58px] rounded-full transition-all duration-200"
              style={{
                background: greenGradient,
                border: "1px solid rgba(255,255,255,0.25)",
                boxShadow: `0 0 28px -4px ${glowColor(C.green, 0.8)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
              }}
            />
          )}
        </button>
        <span className="text-[10px] tracking-widest uppercase" style={{ color: "#5c6b64" }}>
          {recording ? "Tap to stop" : mode === "video" ? "Record video" : "Record audio"}
        </span>
      </div>

      {/* Profile / Account details modal */}
      {profileOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setProfileOpen(false)} />
          <div className="relative w-full max-w-sm rounded-3xl border border-white/15 bg-[#0a1633] p-6 shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/5">
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-bold uppercase text-white">
                    {user?.name ? user.name[0] : "G"}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                <h3 className="truncate text-base font-semibold text-white">
                  {user?.name || "Guest User"}
                </h3>
                <p className="truncate text-xs text-slate-400">
                  {user?.email || "Not signed in with Google"}
                </p>
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {pro ? "Google Play 6-Month Pro" : "Free Plan (1 export left)"}
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              {!pro && onOpenPaywall && (
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onOpenPaywall();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 py-3 text-xs font-bold text-slate-950 shadow-lg active:scale-98"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  Get 6-Month Premium (₹199)
                </button>
              )}

              {onSignOut && (
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onSignOut();
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-xs font-medium text-rose-400 transition hover:bg-rose-500/10 active:scale-98"
                >
                  Sign Out / Switch Account
                </button>
              )}

              <button
                onClick={() => setProfileOpen(false)}
                className="w-full py-2 text-center text-xs text-slate-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
