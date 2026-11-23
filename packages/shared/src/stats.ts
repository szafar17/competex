/**
 * Stat engine: 28-day rolling window of workouts → six-stat vector.
 *
 * Implements V3 §6 C4: soft cap so grinders plateau instead of running away,
 * plus a "big-gap reflection rebate" — if a user disappears for a week or
 * more, the work they did before the gap is partially rebated when they
 * return instead of silently decaying to nothing. Comebacks should feel
 * possible, not punished.
 */

import { STAT_KEYS, type StatKey, type StatVector, type WorkoutKind } from "./enums.js";

export const STAT_WINDOW_DAYS = 28;
export const GAP_DAYS = 7;
/** Fraction of pre-gap points kept when a big gap is detected. */
export const REFLECTION_REBATE = 0.6;

export interface WorkoutForStats {
  kind: WorkoutKind;
  startedAt: Date;
  durationMin: number;
  /** Perceived intensity 1–10. */
  intensity: number;
}

/** How one minute of each workout kind feeds the six stats (weights sum ≈ 1). */
export const KIND_WEIGHTS: Record<WorkoutKind, StatVector> = {
  run: { power: 0.05, speed: 0.3, endurance: 0.45, technique: 0.0, reaction: 0.05, willpower: 0.15 },
  strength: { power: 0.5, speed: 0.05, endurance: 0.15, technique: 0.1, reaction: 0.0, willpower: 0.2 },
  hiit: { power: 0.15, speed: 0.25, endurance: 0.3, technique: 0.05, reaction: 0.1, willpower: 0.15 },
  sparring: { power: 0.1, speed: 0.15, endurance: 0.15, technique: 0.25, reaction: 0.3, willpower: 0.05 },
  drills: { power: 0.05, speed: 0.15, endurance: 0.1, technique: 0.45, reaction: 0.2, willpower: 0.05 },
  mobility: { power: 0.0, speed: 0.1, endurance: 0.1, technique: 0.35, reaction: 0.1, willpower: 0.35 },
  swim: { power: 0.1, speed: 0.2, endurance: 0.45, technique: 0.15, reaction: 0.0, willpower: 0.1 },
  cycle: { power: 0.1, speed: 0.25, endurance: 0.5, technique: 0.0, reaction: 0.0, willpower: 0.15 },
};

export const BASE_STAT = 20;
/** Points of raw work that put a stat at ~the soft-cap knee. */
const SOFT_CAP_SCALE = 900;

/** Soft cap: linear at first, asymptotic to 99. Integer result 1–99. */
export function softCap(rawPoints: number): number {
  const x = Math.max(0, rawPoints) / SOFT_CAP_SCALE;
  const value = BASE_STAT + (99 - BASE_STAT) * (x / (1 + x));
  return Math.max(1, Math.min(99, Math.round(value)));
}

function dayDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/**
 * Compute the six-stat vector from workouts inside the rolling window.
 * `now` is injected so the function stays pure and testable.
 */
export function computeStats(workouts: readonly WorkoutForStats[], now: Date): StatVector {
  const windowStart = new Date(now.getTime() - STAT_WINDOW_DAYS * 86_400_000);
  const inWindow = workouts
    .filter((w) => w.startedAt >= windowStart && w.startedAt <= now)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  // Detect the most recent gap of GAP_DAYS+ inside the window (including the
  // gap between the last workout and now — but that one earns no rebate, the
  // user hasn't come back yet).
  let gapEndsAt: Date | null = null;
  for (let i = 1; i < inWindow.length; i++) {
    if (dayDiff(inWindow[i]!.startedAt, inWindow[i - 1]!.startedAt) >= GAP_DAYS) {
      gapEndsAt = inWindow[i]!.startedAt;
    }
  }

  const raw: Record<StatKey, number> = {
    power: 0, speed: 0, endurance: 0, technique: 0, reaction: 0, willpower: 0,
  };

  for (const w of inWindow) {
    // Recency: yesterday's session counts more than one from 4 weeks ago.
    const age = dayDiff(now, w.startedAt);
    const recency = 1 - (age / STAT_WINDOW_DAYS) * 0.5; // 1.0 → 0.5 across the window
    // Reflection rebate: pre-gap work keeps REFLECTION_REBATE of its value
    // instead of the recency-decayed sliver it would otherwise be worth.
    const preGap = gapEndsAt !== null && w.startedAt < gapEndsAt;
    const weight = preGap ? Math.max(recency, REFLECTION_REBATE) : recency;
    const points = w.durationMin * (w.intensity / 5) * weight;
    const mix = KIND_WEIGHTS[w.kind];
    for (const key of STAT_KEYS) raw[key] += points * mix[key];
  }

  const out = {} as StatVector;
  for (const key of STAT_KEYS) out[key] = softCap(raw[key]);
  return out;
}

/** Default vector for brand-new users and seeded bots. */
export function defaultStats(): StatVector {
  return { power: BASE_STAT, speed: BASE_STAT, endurance: BASE_STAT, technique: BASE_STAT, reaction: BASE_STAT, willpower: BASE_STAT };
}

/** Standard ELO expected score + delta. */
export function eloDelta(rating: number, opponentRating: number, score: 0 | 0.5 | 1, k: number): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
  return Math.round(k * (score - expected));
}
