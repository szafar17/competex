/**
 * Avatar engine: face landmarks → 2D "Inkline" rig.
 *
 * Input is a normalized landmark set (0–1 coordinates, face-detection style).
 * When no landmarks are available (onboarding skip, bots) we synthesize a
 * deterministic set from a seed so every handle still gets a unique face.
 *
 * Output is plain SVG path data grouped by layer, plus a ready-to-ship
 * <svg> string. The mobile client feeds the same paths into its SVG scene.
 */

import { mulberry32, stringSeed, type AvatarVariant } from "@cx/shared";

export interface FaceLandmarks {
  /** All coordinates normalized 0–1 in face-box space. */
  faceWidth: number; // 0.6–1 relative width
  jaw: number; // 0 round → 1 square
  eyeY: number; // vertical eye line 0.3–0.5
  eyeSpacing: number; // 0.15–0.3
  eyeSize: number; // 0.04–0.09
  browTilt: number; // -1 fierce → 1 soft
  noseLength: number; // 0.1–0.25
  mouthY: number; // 0.65–0.8
  mouthWidth: number; // 0.15–0.35
  mouthCurve: number; // -1 frown → 1 grin
  hairVolume: number; // 0 shaved → 1 full
}

export interface AvatarRig {
  variant: AvatarVariant;
  /** Layered path data, back to front. */
  layers: { name: string; d: string; stroke: string; strokeWidth: number; fill: string }[];
  viewBox: string;
}

interface VariantStyle {
  stroke: string;
  strokeWidth: number;
  skin: string;
  hair: string;
  accent: string;
  jitter: number; // hand-drawn wobble, px
}

const VARIANTS: Record<AvatarVariant, VariantStyle> = {
  inkline: { stroke: "#101014", strokeWidth: 4.5, skin: "none", hair: "#101014", accent: "#e8542f", jitter: 0 },
  soft: { stroke: "#3c3a40", strokeWidth: 3, skin: "#f6e7da", hair: "#6b5847", accent: "#f0a35e", jitter: 0 },
  editorial: { stroke: "#17171b", strokeWidth: 2.2, skin: "#ffffff", hair: "#17171b", accent: "#2f5fe8", jitter: 0 },
  brush: { stroke: "#1d1b1e", strokeWidth: 6, skin: "none", hair: "#1d1b1e", accent: "#c93a2e", jitter: 2.5 },
};

/** Deterministic landmark synthesis from any string (handle, user id…). */
export function landmarksFromSeed(seedText: string): FaceLandmarks {
  const rand = mulberry32(stringSeed(seedText));
  const pick = (lo: number, hi: number) => lo + rand() * (hi - lo);
  return {
    faceWidth: pick(0.68, 0.95),
    jaw: pick(0, 1),
    eyeY: pick(0.34, 0.46),
    eyeSpacing: pick(0.17, 0.27),
    eyeSize: pick(0.045, 0.085),
    browTilt: pick(-1, 1),
    noseLength: pick(0.12, 0.22),
    mouthY: pick(0.68, 0.78),
    mouthWidth: pick(0.18, 0.32),
    mouthCurve: pick(-0.6, 1),
    hairVolume: pick(0, 1),
  };
}

const SIZE = 200;
const CX = 100;
const CY = 105;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildRig(landmarks: FaceLandmarks, variant: AvatarVariant): AvatarRig {
  const s = VARIANTS[variant];
  const rand = mulberry32(stringSeed(JSON.stringify(landmarks) + variant));
  const j = (amt = s.jitter) => (amt === 0 ? 0 : (rand() - 0.5) * 2 * amt);

  const halfW = 62 * landmarks.faceWidth;
  const halfH = 72;
  const jawDrop = 18 + landmarks.jaw * 14;

  // Face outline: top arc + jaw, square-ness from the jaw landmark.
  const face = [
    `M ${round1(CX - halfW + j())} ${round1(CY - 18 + j())}`,
    `C ${round1(CX - halfW + j())} ${round1(CY - halfH + j())}, ${round1(CX + halfW + j())} ${round1(CY - halfH + j())}, ${round1(CX + halfW + j())} ${round1(CY - 18 + j())}`,
    `C ${round1(CX + halfW + j())} ${round1(CY + jawDrop + j())}, ${round1(CX + halfW * (0.4 + landmarks.jaw * 0.25) + j())} ${round1(CY + halfH + j())}, ${round1(CX + j())} ${round1(CY + halfH + j())}`,
    `C ${round1(CX - halfW * (0.4 + landmarks.jaw * 0.25) + j())} ${round1(CY + halfH + j())}, ${round1(CX - halfW + j())} ${round1(CY + jawDrop + j())}, ${round1(CX - halfW + j())} ${round1(CY - 18 + j())}`,
    "Z",
  ].join(" ");

  const eyeY = CY - halfH + landmarks.eyeY * 2 * halfH;
  const eyeDX = landmarks.eyeSpacing * 2 * halfW;
  const eyeR = landmarks.eyeSize * SIZE;
  const eyes = [
    `M ${round1(CX - eyeDX - eyeR)} ${round1(eyeY + j())} a ${round1(eyeR)} ${round1(eyeR * 0.8)} 0 1 0 ${round1(eyeR * 2)} 0 a ${round1(eyeR)} ${round1(eyeR * 0.8)} 0 1 0 ${round1(-eyeR * 2)} 0`,
    `M ${round1(CX + eyeDX - eyeR)} ${round1(eyeY + j())} a ${round1(eyeR)} ${round1(eyeR * 0.8)} 0 1 0 ${round1(eyeR * 2)} 0 a ${round1(eyeR)} ${round1(eyeR * 0.8)} 0 1 0 ${round1(-eyeR * 2)} 0`,
  ].join(" ");

  const browY = eyeY - eyeR - 8;
  const tilt = landmarks.browTilt * 6;
  const brows = [
    `M ${round1(CX - eyeDX - eyeR - 2)} ${round1(browY + tilt + j())} L ${round1(CX - eyeDX + eyeR + 2)} ${round1(browY - tilt + j())}`,
    `M ${round1(CX + eyeDX - eyeR - 2)} ${round1(browY - tilt + j())} L ${round1(CX + eyeDX + eyeR + 2)} ${round1(browY + tilt + j())}`,
  ].join(" ");

  const noseLen = landmarks.noseLength * 2 * halfH;
  const nose = `M ${round1(CX + j())} ${round1(eyeY + 6)} C ${round1(CX - 4 + j())} ${round1(eyeY + noseLen * 0.7)}, ${round1(CX - 8 + j())} ${round1(eyeY + noseLen)}, ${round1(CX - 2 + j())} ${round1(eyeY + noseLen + j())}`;

  const mouthY = CY - halfH + landmarks.mouthY * 2 * halfH;
  const mouthHalf = landmarks.mouthWidth * halfW;
  const curve = landmarks.mouthCurve * 10;
  const mouth = `M ${round1(CX - mouthHalf + j())} ${round1(mouthY + j())} Q ${round1(CX + j())} ${round1(mouthY + curve + j())}, ${round1(CX + mouthHalf + j())} ${round1(mouthY + j())}`;

  const hairLift = 10 + landmarks.hairVolume * 26;
  const hair = landmarks.hairVolume < 0.08
    ? ""
    : [
        `M ${round1(CX - halfW + j())} ${round1(CY - 24 + j())}`,
        `C ${round1(CX - halfW - 6 + j())} ${round1(CY - halfH - hairLift + j())}, ${round1(CX + halfW + 6 + j())} ${round1(CY - halfH - hairLift + j())}, ${round1(CX + halfW + j())} ${round1(CY - 24 + j())}`,
        `C ${round1(CX + halfW * 0.7 + j())} ${round1(CY - halfH + 6 + j())}, ${round1(CX - halfW * 0.7 + j())} ${round1(CY - halfH + 6 + j())}, ${round1(CX - halfW + j())} ${round1(CY - 24 + j())}`,
        "Z",
      ].join(" ");

  const layers: AvatarRig["layers"] = [
    { name: "face", d: face, stroke: s.stroke, strokeWidth: s.strokeWidth, fill: s.skin },
    ...(hair ? [{ name: "hair", d: hair, stroke: s.stroke, strokeWidth: s.strokeWidth, fill: s.hair }] : []),
    { name: "brows", d: brows, stroke: s.stroke, strokeWidth: s.strokeWidth + 1, fill: "none" },
    { name: "eyes", d: eyes, stroke: s.stroke, strokeWidth: s.strokeWidth * 0.8, fill: variant === "editorial" ? s.accent : s.stroke },
    { name: "nose", d: nose, stroke: s.stroke, strokeWidth: s.strokeWidth * 0.8, fill: "none" },
    { name: "mouth", d: mouth, stroke: variant === "soft" ? s.accent : s.stroke, strokeWidth: s.strokeWidth, fill: "none" },
  ];

  return { variant, layers, viewBox: `0 0 ${SIZE} ${SIZE}` };
}

/** Convenience: full standalone SVG document string. */
export function renderSvg(rig: AvatarRig): string {
  const paths = rig.layers
    .map(
      (l) =>
        `<path data-layer="${l.name}" d="${l.d}" stroke="${l.stroke}" stroke-width="${l.strokeWidth}" fill="${l.fill}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rig.viewBox}">${paths}</svg>`;
}

export function avatarSvgForSeed(seedText: string, variant: AvatarVariant): string {
  return renderSvg(buildRig(landmarksFromSeed(seedText), variant));
}
