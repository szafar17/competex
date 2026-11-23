import type { Discipline, MoveDef, StatVector } from "@cx/shared";

/** Input bitmask, one per tick per fighter. 6 bits → 0–63. */
export const INPUT = {
  LEFT: 1,
  RIGHT: 2,
  LIGHT: 4,
  HEAVY: 8,
  BLOCK: 16,
  SPECIAL: 32,
} as const;

export type Corner = "a" | "b";

export interface FighterConfig {
  stats: StatVector;
  disciplines: readonly Discipline[];
}

export interface MatchRules {
  rounds: number;
  ticksPerRound: number;
  tickHz: number;
  engineVersion: string;
}

export interface BattleConfig {
  seed: number;
  a: FighterConfig;
  b: FighterConfig;
  rules: MatchRules;
}

export type FighterState =
  | "idle"
  | "walk"
  | "attack"
  | "block"
  | "hitstun"
  | "gassed"
  | "ko";

export type MovePhase = "startup" | "active" | "recovery";

/** Ordinals used in the rolling hash — order is part of the wire format. */
export const STATE_ORD: Record<FighterState, number> = {
  idle: 0,
  walk: 1,
  attack: 2,
  block: 3,
  hitstun: 4,
  gassed: 5,
  ko: 6,
};

export interface FighterView {
  x: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  meter: number;
  state: FighterState;
  moveId: string | null;
  movePhase: MovePhase | null;
  /** 0–100 progress through the current move phase, for animation. */
  phaseProgress: number;
  counterWindow: boolean;
  roundWins: number;
}

export type BattleEventType =
  | "hit"
  | "blocked"
  | "dodged"
  | "counter"
  | "gassed"
  | "special"
  | "ko"
  | "round_start"
  | "round_end"
  | "match_end";

export interface BattleEvent {
  tick: number;
  type: BattleEventType;
  /** The fighter the event is about (attacker for hit/blocked, victim for ko). */
  corner?: Corner;
  damage?: number;
  moveId?: string;
  round?: number;
  winner?: Corner | "draw";
}

export interface RoundResult {
  winner: Corner | "draw";
  aHp: number;
  bHp: number;
}

export interface StepResult {
  tick: number;
  round: number;
  done: boolean;
  events: BattleEvent[];
  a: FighterView;
  b: FighterView;
}

export interface MatchResult {
  winner: Corner | "draw";
  rounds: RoundResult[];
  koRound: number | null;
  ticksSimulated: number;
  hash: number;
  boxScore: {
    hits: Record<Corner, number>;
    blocked: Record<Corner, number>;
    dodged: Record<Corner, number>;
    specials: Record<Corner, number>;
    koRound: number | null;
  };
}

export interface InternalFighter {
  cfg: FighterConfig;
  moves: MoveDef[];
  x: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  stamina: number; // tenths, integer
  maxStamina: number;
  meter: number; // 0–100
  state: FighterState;
  moveIndex: number;
  phase: MovePhase;
  phaseLeft: number;
  hitLanded: boolean; // one hit per active phase
  hitstunLeft: number;
  counterLeft: number;
  knockVel: number; // signed, decays
  walkSpeed: number;
  regen: number;
  roundWins: number;
}
