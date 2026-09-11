import { C, greenGradient, glowColor } from "../lib/theme";
import type { MediaKind } from "../lib/audio";
import type { Progress, Stage } from "../lib/encode";

const STAGES: { id: Stage; label: string }[] = [
  { id: "prepare", label: "Preparing" },
  { id: "video", label: "Rendering video" },
  { id: "finalize", label: "Finalizing" },
];

const AUDIO_STAGES: { id: Stage; label: string }[] = [
  { id: "audio", label: "Applying effects" },
  { id: "finalize", label: "Encoding MP3" },
];

const order: Stage[] = ["prepare", "video", "audio", "finalize", "done"];

export function ExportOverlay({
  kind,
  progress,
  done,
  error,
  onClose,
  filename,
}: {
  kind: MediaKind;
  progress: Progress;
  done: boolean;
  error: boolean;
  onClose: () => void;
  filename?: string;
}) {
  const steps = kind === "video" ? STAGES : AUDIO_STAGES;
  const curIdx = order.indexOf(progress.stage);

  // overall percentage across the pipeline
  const weights =
    kind === "video"
      ? { prepare: 0.1, video: 0.82, finalize: 0.08 }
      : { prepare: 0, video: 0, audio: 0.55, finalize: 0.45 };
  let overall = 0;
  for (const s of steps) {
    const w = (weights as Record<string, number>)[s.id] ?? 0;
    if (order.indexOf(s.id) < curIdx) overall += w;
    else if (s.id === progress.stage) overall += w * progress.ratio;
  }
  if (done) overall = 1;
  const pct = Math.round(Math.min(1, overall) * 100);

  const ext = kind === "video" ? "MP4" : "MP3";

  // ---------- dedicated AFTER-EXPORT success screen ----------
  if (done) {
    return (
      <div
        className="absolute inset-0 z-50 flex flex-col items-center justify-center px-8 text-center"
        style={{ background: "linear-gradient(180deg,#0c1a3a 0%,#0a1633 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-1/4 h-72"
          style={{
            background: `radial-gradient(circle at 50% 30%, ${glowColor(C.green, 0.28)} 0%, transparent 70%)`,
          }}
        />

        {/* big animated check */}
        <div
          className="relative grid h-24 w-24 place-items-center rounded-full"
          style={{
            background: glowColor(C.green, 0.16),
            boxShadow: `0 0 46px -6px ${glowColor(C.green, 0.85)}`,
            animation: "afxPop 500ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <div
            className="grid h-16 w-16 place-items-center rounded-full"
            style={{ background: greenGradient }}
          >
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#052012"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        </div>

        <h1 className="relative mt-6 text-[26px] font-bold tracking-tight" style={{ color: C.silver }}>
          {kind === "video" ? "Video exported!" : "Audio exported!"}
        </h1>
        <p className="relative mt-2 max-w-[17rem] text-[13px] leading-relaxed" style={{ color: C.silverDim }}>
          Your {ext} file has been saved to your device's downloads. 🎉
        </p>

        <div
          className="relative mt-5 flex items-center gap-2 rounded-xl border px-3.5 py-2.5"
          style={{ borderColor: C.line, background: "rgba(255,255,255,0.04)" }}
        >
          <span className="text-[15px]">{kind === "video" ? "🎬" : "🎵"}</span>
          <span className="font-mono text-[11px]" style={{ color: C.silver }}>
            {filename || `aud-fx.${ext.toLowerCase()}`}
          </span>
        </div>

        <button
          onClick={onClose}
          className="relative mt-8 w-full max-w-[300px] rounded-2xl py-4 text-[15px] font-bold uppercase tracking-[0.1em] transition active:scale-[0.98]"
          style={{
            background: greenGradient,
            color: "#052012",
            border: "1px solid rgba(255,255,255,0.35)",
            boxShadow: `0 12px 34px -12px ${glowColor(C.green, 0.9)}`,
          }}
        >
          Done
        </button>

        <style>{`@keyframes afxPop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-7">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />

      <div
        className="relative w-full max-w-[340px] rounded-[26px] border p-7"
        style={{
          borderColor: C.line,
          background: "linear-gradient(180deg,#152447 0%,#0a1633 100%)",
          boxShadow: `0 30px 80px -30px ${glowColor(C.green, 0.7)}`,
        }}
      >
        {/* icon */}
        <div className="mb-5 flex justify-center">
          {error ? (
            <div
              className="grid h-16 w-16 place-items-center rounded-2xl text-[26px]"
              style={{ background: "rgba(255,77,106,0.15)", color: C.rec }}
            >
              !
            </div>
          ) : (
            <div className="relative grid h-16 w-16 place-items-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(199,208,214,0.14)" strokeWidth="5" />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke={C.green}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 28}
                  strokeDashoffset={2 * Math.PI * 28 * (1 - pct / 100)}
                  style={{ transition: "stroke-dashoffset 0.25s ease" }}
                />
              </svg>
              <span className="font-mono text-[13px] font-semibold" style={{ color: C.silver }}>
                {pct}%
              </span>
            </div>
          )}
        </div>

        {/* title */}
        <h2 className="text-center text-[19px] font-semibold" style={{ color: C.silver }}>
          {error ? "Export failed" : `Exporting ${ext}`}
        </h2>
        <p className="mx-auto mt-1.5 max-w-[15rem] text-center text-[12px] leading-relaxed" style={{ color: C.silverDim }}>
          {error
            ? "Something went wrong. Please try again."
            : "Rendering at studio quality — please keep the app open."}
        </p>

        {/* step list */}
        {!error && (
          <div className="mt-5 space-y-2">
            {steps.map((s) => {
              const idx = order.indexOf(s.id);
              const state = idx < curIdx ? "done" : s.id === progress.stage ? "active" : "todo";
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]"
                    style={{
                      background:
                        state === "done"
                          ? C.green
                          : state === "active"
                          ? glowColor(C.green, 0.25)
                          : "rgba(199,208,214,0.08)",
                      color: state === "done" ? "#06120c" : C.silverDim,
                    }}
                  >
                    {state === "done" ? "✓" : state === "active" ? "•" : ""}
                  </span>
                  <span
                    className="text-[12px]"
                    style={{ color: state === "todo" ? "#5c6b64" : C.silver }}
                  >
                    {s.label}
                  </span>
                  {state === "active" && (
                    <span className="ml-auto flex gap-1">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="h-1 w-1 rounded-full"
                          style={{
                            background: C.green,
                            animation: `afxBlink 1s ${d * 0.15}s infinite`,
                          }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* actions */}
        {error && (
          <button
            onClick={onClose}
            className="mt-6 w-full rounded-2xl py-3.5 text-[14px] font-semibold transition active:scale-[0.98]"
            style={{
              background: "rgba(199,208,214,0.1)",
              color: C.silver,
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            Close
          </button>
        )}
      </div>

      <style>{`@keyframes afxBlink{0%,100%{opacity:.25}50%{opacity:1}}`}</style>
    </div>
  );
}
