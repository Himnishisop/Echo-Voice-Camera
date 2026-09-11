import { useRef, useEffect, useState, useCallback } from "react";
import { C } from "../lib/theme";

/* ---------- Rotary knob (drag up/down, or around) ---------- */
export function Knob({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = "",
  format,
  onChange,
  size = 78,
  color = C.silver,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  size?: number;
  color?: string;
}) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + pct * 270;
  const r = size / 2 - 7;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const arc = (270 / 360) * circ;

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { y: e.clientY, v: value };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    const range = max - min;
    const next = drag.current.v + (dy / 160) * range;
    const snapped = Math.round(next / step) * step;
    onChange(Math.max(min, Math.min(max, +snapped.toFixed(4))));
  };
  const onUp = () => (drag.current = null);

  const display = format ? format(value) : `${value.toFixed(2)}${unit}`;

  return (
    <div className="flex flex-col items-center gap-1 select-none touch-none">
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => onChange(min + (max - min) / 2)}
        className="cursor-ns-resize active:scale-95 transition-transform"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(199,208,214,0.14)"
            strokeWidth={6}
            strokeDasharray={`${arc} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(135 ${cx} ${cy})`}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeDasharray={`${arc * pct} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(135 ${cx} ${cy})`}
            style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
          />
          <circle cx={cx} cy={cy} r={r - 11} fill="#0a1410" stroke="rgba(199,208,214,0.16)" />
          <g transform={`rotate(${angle} ${cx} ${cy})`}>
            <line
              x1={cx}
              y1={cy - (r - 20)}
              x2={cx}
              y2={cy - 6}
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-[11px] font-mono text-zinc-200 tabular-nums">{display}</div>
    </div>
  );
}

/* ---------- Stereo level meter ---------- */
export function LevelMeter({ get, active = true }: { get: () => number | null; active?: boolean }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    let raf = 0;
    const loop = () => {
      const v = get();
      setLevel(v ?? 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [get, active]);

  const bars = 22;
  const lit = Math.round(level * bars);
  return (
    <div className="flex items-end gap-[3px] h-8">
      {Array.from({ length: bars }).map((_, i) => {
        const on = i < lit;
        const hot = i > bars - 4;
        return (
          <div
            key={i}
            className="w-[3px] rounded-full transition-all duration-75"
            style={{
              height: `${25 + i * 3}%`,
              background: on
                ? hot
                  ? "#e0324a"
                  : i > bars - 8
                  ? "#cbd5dc"
                  : C.green
                : "rgba(199,208,214,0.14)",
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------- Bottom sheet ---------- */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute bottom-0 left-0 right-0 rounded-t-[28px] border-t px-5 pb-8 pt-3 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          borderColor: C.line,
          background: "linear-gradient(180deg,#0e1a13 0%,#070f0b 100%)",
        }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: "rgba(199,208,214,0.25)" }} />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: C.silver }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1 text-xs active:scale-95"
            style={{ background: "rgba(199,208,214,0.08)", color: C.silver }}
          >
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Preset chip grid ---------- */
export function PresetGrid<T extends { id: string; name: string; sub: string }>({
  presets,
  activeId,
  onPick,
  color,
}: {
  presets: T[];
  activeId: string;
  onPick: (p: T) => void;
  color: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {presets.map((p) => {
        const on = p.id === activeId;
        return (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="rounded-2xl border px-2 py-3 text-center transition-all active:scale-95"
            style={
              on
                ? {
                    borderColor: "transparent",
                    background: "linear-gradient(180deg,#eef3f5 0%,#c3ccd2 45%,#9aa5ac 100%)",
                    color: "#0a1410",
                    boxShadow: `0 0 20px ${color}55`,
                  }
                : { borderColor: C.line, background: "rgba(199,208,214,0.03)", color: C.silver }
            }
          >
            <div className="text-[13px] font-semibold leading-tight">{p.name}</div>
            <div className="mt-0.5 text-[9px]" style={{ color: on ? "rgba(10,20,16,0.6)" : "#5c6b64" }}>
              {p.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Simple slider (volume) ---------- */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const metal = "linear-gradient(180deg,#e4e9f0 0%,#aab4c2 48%,#7d8a9c 100%)";
  return (
    <div className="relative h-11 select-none touch-none">
      {/* track */}
      <div
        className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full"
        style={{ background: "rgba(150,165,190,0.16)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)" }}
      />
      {/* metallic silver fill */}
      <div
        className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full"
        style={{
          width: `${pct}%`,
          background: metal,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55), 0 0 10px rgba(174,183,196,0.4)",
        }}
      />
      {/* raised silver knob */}
      <div
        className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${pct}%`,
          background: metal,
          border: "1px solid rgba(255,255,255,0.5)",
          boxShadow: "0 2px 5px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.7)",
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

/* ---------- Trim bar: dual handles + live playhead ---------- */
export function TrimBar({
  duration,
  start,
  end,
  playhead,
  onChange,
  onScrub,
}: {
  duration: number;
  start: number;
  end: number;
  playhead: number;
  onChange: (start: number, end: number) => void;
  onScrub: (t: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const eff = end > 0 ? end : duration;
  const pos = (t: number) => (duration ? Math.max(0, Math.min(1, t / duration)) * 100 : 0);

  const drag = (which: "start" | "end" | "scrub") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const toT = (clientX: number) =>
      Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
    const move = (clientX: number) => {
      const t = toT(clientX);
      if (which === "start") onChange(Math.min(t, eff - 0.2), eff);
      else if (which === "end") onChange(start, Math.max(t, start + 0.2));
      else onScrub(t);
    };
    move(e.clientX);
    const onMove = (ev: PointerEvent) => move(ev.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const bars = 40;
  return (
    <div className="select-none touch-none">
      <div
        ref={trackRef}
        onPointerDown={drag("scrub")}
        className="relative h-11 w-full overflow-hidden rounded-xl"
        style={{ background: "rgba(199,208,214,0.06)", border: `1px solid ${C.line}` }}
      >
        {/* fake thumbnail bars */}
        <div className="pointer-events-none absolute inset-0 flex items-center gap-[2px] px-1">
          {Array.from({ length: bars }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-full"
              style={{
                height: `${30 + ((i * 37) % 55)}%`,
                background: "rgba(199,208,214,0.14)",
              }}
            />
          ))}
        </div>

        {/* dimmed outside-trim regions */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-black/60"
          style={{ width: `${pos(start)}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-black/60"
          style={{ width: `${100 - pos(eff)}%` }}
        />

        {/* selection frame */}
        <div
          className="pointer-events-none absolute inset-y-0 border-y-2"
          style={{
            left: `${pos(start)}%`,
            right: `${100 - pos(eff)}%`,
            borderColor: C.green,
            boxShadow: `inset 0 0 0 9999px rgba(31,157,99,0.06)`,
          }}
        />

        {/* playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 w-[2px]"
          style={{ left: `${pos(playhead)}%`, background: C.silver }}
        />

        {/* handles */}
        <div
          onPointerDown={drag("start")}
          className="absolute inset-y-0 flex w-5 -translate-x-1/2 cursor-ew-resize items-center justify-center"
          style={{ left: `${pos(start)}%` }}
        >
          <div
            className="h-8 w-[7px] rounded-full"
            style={{ background: C.green, boxShadow: `0 0 10px ${C.green}` }}
          />
        </div>
        <div
          onPointerDown={drag("end")}
          className="absolute inset-y-0 flex w-5 -translate-x-1/2 cursor-ew-resize items-center justify-center"
          style={{ left: `${pos(eff)}%` }}
        >
          <div
            className="h-8 w-[7px] rounded-full"
            style={{ background: C.green, boxShadow: `0 0 10px ${C.green}` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- Live waveform strip (decorative, driven by analyser) ---------- */
export function Waveform({ get, playing }: { get: () => number | null; playing: boolean }) {
  const [bars, setBars] = useState<number[]>(() => Array(34).fill(0.05));
  const getRef = useCallback(get, [get]);
  useEffect(() => {
    let raf = 0;
    let idx = 0;
    const loop = () => {
      const v = getRef();
      if (v !== null && playing) {
        setBars((prev) => {
          const next = [...prev];
          next[idx % next.length] = Math.max(0.06, Math.min(1, v * 1.4));
          idx++;
          return next;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getRef, playing]);

  return (
    <div className="flex h-12 items-center gap-[2px] overflow-hidden rounded-xl bg-black/40 px-3">
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex-1 rounded-full transition-all duration-100"
          style={{
            height: `${Math.max(6, b * 100)}%`,
            opacity: playing ? 1 : 0.3,
            background: `linear-gradient(0deg,${C.greenDeep},${C.silver})`,
          }}
        />
      ))}
    </div>
  );
}
