/**
 * Discipline moveset mixer.
 *
 * A fighter declares 1–3 disciplines. The mixer assembles a 4-move kit
 * (light / heavy / grapple / special) drawn from those disciplines, with
 * frame data and damage scaled by the fighter's stat vector. All numbers are
 * integers so the battle engine stays deterministic.
 */

import type { Discipline, StatVector } from "./enums.js";

export type MoveSlot = "light" | "heavy" | "grapple" | "special";

export interface MoveDef {
  id: string;
  name: string;
  slot: MoveSlot;
  discipline: Discipline;
  /** Frame data in ticks (60Hz). */
  startup: number;
  active: number;
  recovery: number;
  /** Damage in HP tenths on clean hit. */
  damage: number;
  /** Chip damage in HP tenths when blocked. */
  chip: number;
  /** Stamina cost in tenths. */
  staminaCost: number;
  /** Horizontal shove applied to the defender on hit, in arena units. */
  knockback: number;
  /** Reach in arena units, measured from the attacker's edge. */
  range: number;
  /** Special meter gained by the attacker on contact (hit or block). */
  meterGain: number;
}

type MoveSeed = Omit<MoveDef, "id" | "discipline" | "slot">;

const KITS: Record<Discipline, Record<MoveSlot, MoveSeed>> = {
  boxing: {
    light: { name: "Jab", startup: 6, active: 3, recovery: 8, damage: 38, chip: 4, staminaCost: 25, knockback: 14, range: 95, meterGain: 6 },
    heavy: { name: "Cross", startup: 12, active: 4, recovery: 16, damage: 80, chip: 9, staminaCost: 55, knockback: 30, range: 105, meterGain: 10 },
    grapple: { name: "Clinch Break", startup: 10, active: 5, recovery: 14, damage: 50, chip: 0, staminaCost: 45, knockback: 60, range: 70, meterGain: 8 },
    special: { name: "Peek-a-Boo Barrage", startup: 9, active: 10, recovery: 20, damage: 150, chip: 22, staminaCost: 80, knockback: 45, range: 100, meterGain: 0 },
  },
  muay_thai: {
    light: { name: "Teep", startup: 8, active: 4, recovery: 10, damage: 42, chip: 6, staminaCost: 30, knockback: 36, range: 130, meterGain: 7 },
    heavy: { name: "Roundhouse", startup: 14, active: 5, recovery: 18, damage: 92, chip: 12, staminaCost: 65, knockback: 34, range: 140, meterGain: 11 },
    grapple: { name: "Clinch Knee", startup: 11, active: 5, recovery: 15, damage: 64, chip: 8, staminaCost: 50, knockback: 20, range: 75, meterGain: 9 },
    special: { name: "Elbow Storm", startup: 10, active: 8, recovery: 22, damage: 160, chip: 24, staminaCost: 85, knockback: 40, range: 85, meterGain: 0 },
  },
  karate: {
    light: { name: "Gyaku-zuki", startup: 5, active: 3, recovery: 9, damage: 34, chip: 4, staminaCost: 22, knockback: 16, range: 100, meterGain: 6 },
    heavy: { name: "Mawashi-geri", startup: 13, active: 4, recovery: 17, damage: 84, chip: 10, staminaCost: 60, knockback: 32, range: 135, meterGain: 10 },
    grapple: { name: "Foot Sweep", startup: 9, active: 4, recovery: 13, damage: 46, chip: 0, staminaCost: 40, knockback: 55, range: 90, meterGain: 8 },
    special: { name: "Kiai Rush", startup: 7, active: 9, recovery: 18, damage: 145, chip: 20, staminaCost: 75, knockback: 50, range: 110, meterGain: 0 },
  },
  kung_fu: {
    light: { name: "Chain Punch", startup: 5, active: 4, recovery: 7, damage: 30, chip: 4, staminaCost: 20, knockback: 12, range: 90, meterGain: 6 },
    heavy: { name: "Tiger Palm", startup: 12, active: 5, recovery: 16, damage: 78, chip: 10, staminaCost: 55, knockback: 38, range: 110, meterGain: 10 },
    grapple: { name: "Chin Na Lock", startup: 10, active: 5, recovery: 14, damage: 54, chip: 0, staminaCost: 45, knockback: 25, range: 75, meterGain: 9 },
    special: { name: "Dragon Whips Tail", startup: 11, active: 9, recovery: 21, damage: 152, chip: 21, staminaCost: 80, knockback: 55, range: 120, meterGain: 0 },
  },
  wrestling: {
    light: { name: "Hand Fight", startup: 7, active: 4, recovery: 9, damage: 28, chip: 3, staminaCost: 24, knockback: 18, range: 80, meterGain: 7 },
    heavy: { name: "Double Leg", startup: 15, active: 6, recovery: 20, damage: 96, chip: 6, staminaCost: 70, knockback: 24, range: 95, meterGain: 12 },
    grapple: { name: "Suplex", startup: 13, active: 5, recovery: 18, damage: 88, chip: 0, staminaCost: 65, knockback: 70, range: 70, meterGain: 11 },
    special: { name: "Chain Wrestle", startup: 12, active: 10, recovery: 24, damage: 170, chip: 14, staminaCost: 90, knockback: 65, range: 80, meterGain: 0 },
  },
  bjj: {
    light: { name: "Grip Strip", startup: 7, active: 4, recovery: 8, damage: 26, chip: 3, staminaCost: 20, knockback: 10, range: 78, meterGain: 7 },
    heavy: { name: "Takedown Pass", startup: 14, active: 6, recovery: 19, damage: 86, chip: 5, staminaCost: 62, knockback: 28, range: 90, meterGain: 11 },
    grapple: { name: "Arm Drag", startup: 9, active: 5, recovery: 12, damage: 48, chip: 0, staminaCost: 38, knockback: 48, range: 75, meterGain: 9 },
    special: { name: "Submission Chain", startup: 13, active: 11, recovery: 25, damage: 175, chip: 12, staminaCost: 88, knockback: 30, range: 72, meterGain: 0 },
  },
};

/** Slot each discipline contributes when mixing (priority order per slot). */
const SLOTS: readonly MoveSlot[] = ["light", "heavy", "grapple", "special"];

function scale(n: number, stat: number, gain: number): number {
  // stat 50 is neutral; each point is gain/1000 of the base value.
  return Math.max(1, Math.round(n * (1 + ((stat - 50) * gain) / 1000)));
}

/**
 * Mix a 4-move kit from the fighter's disciplines, scaled by their stats.
 * Deterministic: slot i comes from disciplines[i % disciplines.length].
 */
export function mixMoveset(disciplines: readonly Discipline[], stats: StatVector): MoveDef[] {
  const list = disciplines.length > 0 ? disciplines : (["boxing"] as const);
  return SLOTS.map((slot, i) => {
    const d = list[i % list.length]!;
    const seed = KITS[d][slot];
    return {
      ...seed,
      id: `${d}.${slot}`,
      slot,
      discipline: d,
      // Technique trims startup/recovery, power scales damage, endurance
      // trims stamina cost. Speed is handled by the engine as walk speed.
      startup: Math.max(3, scale(seed.startup, 100 - stats.technique, 4)),
      recovery: Math.max(4, scale(seed.recovery, 100 - stats.technique, 4)),
      damage: scale(seed.damage, stats.power, 8),
      chip: scale(seed.chip, stats.power, 6),
      staminaCost: Math.max(5, scale(seed.staminaCost, 100 - stats.endurance, 6)),
    };
  });
}
