export const LOGO_URL = "/icon-512.png";

export const C = {
  bg: "#060d20",
  line: "rgba(199,208,214,0.14)",
  silver: "#eef3f5",
  silverDim: "#9aa5ac",
  green: "#39ff87",
  greenDeep: "#0e5230",
  rec: "#ff4d6a",
  delay: "#38bdf8",
  reverb: "#a78bfa",
  volume: "#fbbf24",
};

export const greenGradient =
  "linear-gradient(180deg, #39ff87 0%, #1fbf6b 60%, #148a4c 100%)";

export const silverGradient =
  "linear-gradient(180deg, #eef3f5 0%, #c3ccd2 45%, #9aa5ac 100%)";

export function glowColor(color: string, opacity: number): string {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (color.startsWith("rgb")) {
    return color.replace(/rgb(a)?\(([^)]+)\)/, (_, _a, vals) => {
      const parts = vals.split(",").map((v: string) => v.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${opacity})`;
    });
  }
  return color;
}
