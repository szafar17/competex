/** Inkline dark theme tokens. */
export const colors = {
  bg: "#0c0c10",
  surface: "#16161d",
  surfaceRaised: "#1f1f29",
  line: "#2c2c38",
  ink: "#f2f0ea",
  inkDim: "#9d9aa8",
  accent: "#e8542f",
  accentSoft: "#f0a35e",
  blue: "#2f5fe8",
  green: "#3fbf6f",
  red: "#e23d3d",
  gold: "#e8b53a",
} as const;

export const spacing = (n: number) => n * 4;

export const STAT_LABELS: Record<string, string> = {
  power: "PWR",
  speed: "SPD",
  endurance: "END",
  technique: "TEC",
  reaction: "REA",
  willpower: "WIL",
};
