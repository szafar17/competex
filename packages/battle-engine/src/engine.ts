/**
 * Deterministic 2D fighter resolver, v0.4.
 *
 * The same code path runs on the client (Expo, 60Hz rAF loop) and the server
 * (Node replay). Determinism rules, enforced at this package boundary:
 *
 *   - no Math.random — seeded mulberry32 only (and only the bot uses it)
 *   - no Date.now — the tick counter is the clock
 *   - no floats persisted across tick boundaries — stamina is integer tenths,
 *     positions and damage are integers
 *
 * Every tick folds the integer state of both fighters into a rolling hash so
 * the client's final hash can be checked byte-for-byte against a server
 * replay of the same seed + inputs.
 */

import { HASH_SEED, mixMoveset, rollingHash, type MoveDef } from "@cx/shared";
import {
  INPUT,
  STATE_ORD,
  type BattleConfig,
  type BattleEvent,
  type Corner,
  type FighterView,
  type InternalFighter,
  type MatchResult,
  type MovePhase,
  type RoundResult,
  type StepResult,
} from "./types.js";

// Arena geometry (integer units)
const ARENA_MIN = 0;
const ARENA_MAX = 1000;
const BODY_GAP = 80; // minimum distance between fighter centers (body collision)
const START_A = 300;
const START_B = 700;

// Tuning (integers only)
const GASSED_RECOVER_AT = 3000; // stamina tenths needed to leave gassed state
const GASSED_DAMAGE_BONUS_PCT = 25;
const COUNTER_DAMAGE_BONUS_PCT = 25;
const COUNTER_STARTUP_CUT_PCT = 40;
const BLOCK_STAMINA_DRAIN = 2; // tenths per tick while holding block
const SPECIAL_METER_COST = 100;

function makeFighter(cfg: BattleConfig["a"], x: number, facing: 1 | -1): InternalFighter {
  const moves = mixMoveset(cfg.disciplines, cfg.stats);
  const maxHp = 1000 + cfg.stats.willpower * 4; // tenths
  const maxStamina = 1000 + cfg.stats.endurance * 60; // tenths
  return {
    cfg,
    moves,
    x,
    facing,
    hp: maxHp,
    maxHp,
    stamina: maxStamina,
    maxStamina,
    meter: 0,
    state: "idle",
    moveIndex: -1,
    phase: "startup",
    phaseLeft: 0,
    hitLanded: false,
    hitstunLeft: 0,
    counterLeft: 0,
    knockVel: 0,
    walkSpeed: 3 + ((cfg.stats.speed / 12) | 0),
    regen: 2 + ((cfg.stats.endurance / 20) | 0), // tenths per tick
    roundWins: 0,
  };
}

function view(f: InternalFighter): FighterView {
  const move = f.moveIndex >= 0 ? f.moves[f.moveIndex]! : null;
  let phaseProgress = 0;
  if (f.state === "attack" && move) {
    const total = move[f.phase];
    phaseProgress = total > 0 ? Math.min(100, ((total - f.phaseLeft) * 100 / total) | 0) : 100;
  }
  return {
    x: f.x,
    facing: f.facing,
    hp: f.hp,
    maxHp: f.maxHp,
    stamina: f.stamina,
    maxStamina: f.maxStamina,
    meter: f.meter,
    state: f.state,
    moveId: f.state === "attack" && move ? move.id : null,
    movePhase: f.state === "attack" ? f.phase : null,
    phaseProgress,
    counterWindow: f.counterLeft > 0,
    roundWins: f.roundWins,
  };
}

export interface Battle {
  /** Advance one tick with both corners' input bitmasks. */
  step(inputA: number, inputB: number): StepResult;
  /** Final result — only valid once a step reported done. */
  result(): MatchResult;
  readonly config: BattleConfig;
}

export function createBattle(config: BattleConfig): Battle {
  const { rules } = config;
  const a = makeFighter(config.a, START_A, 1);
  const b = makeFighter(config.b, START_B, -1);
  const fighters: Record<Corner, InternalFighter> = { a, b };

  let tick = 0; // global tick across the whole match
  let round = 1;
  let roundTick = 0;
  let done = false;
  let hash = rollingHash(HASH_SEED, [config.seed, rules.rounds, rules.ticksPerRound]);
  const roundResults: RoundResult[] = [];
  let koRound: number | null = null;
  let matchWinner: Corner | "draw" = "draw";
  const box = {
    hits: { a: 0, b: 0 },
    blocked: { a: 0, b: 0 },
    dodged: { a: 0, b: 0 },
    specials: { a: 0, b: 0 },
  };

  function resetForRound(): void {
    for (const [corner, f] of [["a", a], ["b", b]] as const) {
      f.x = corner === "a" ? START_A : START_B;
      f.facing = corner === "a" ? 1 : -1;
      f.hp = f.maxHp;
      // Stamina carries fatigue between rounds: refill to 80% of max or keep
      // current, whichever is higher — integer math only.
      f.stamina = Math.max(f.stamina, ((f.maxStamina * 8) / 10) | 0);
      f.meter = Math.min(100, f.meter); // meter carries across rounds
      f.state = "idle";
      f.moveIndex = -1;
      f.phaseLeft = 0;
      f.hitstunLeft = 0;
      f.counterLeft = 0;
      f.knockVel = 0;
      f.hitLanded = false;
    }
  }

  function startMove(f: InternalFighter, idx: number, events: BattleEvent[], corner: Corner): void {
    const move = f.moves[idx]!;
    const isSpecial = move.slot === "special";
    if (isSpecial) {
      if (f.meter < SPECIAL_METER_COST) return;
      f.meter = 0;
      box.specials[corner]++;
      events.push({ tick, type: "special", corner, moveId: move.id });
    }
    if (f.stamina < move.staminaCost) {
      // Swinging on empty gas tanks you.
      f.stamina = 0;
      f.state = "gassed";
      f.moveIndex = -1;
      events.push({ tick, type: "gassed", corner });
      return;
    }
    f.stamina -= move.staminaCost;
    f.state = "attack";
    f.moveIndex = idx;
    f.phase = "startup";
    // Counter window: attacks launched inside it come out much faster.
    const startup = f.counterLeft > 0
      ? Math.max(2, (move.startup * (100 - COUNTER_STARTUP_CUT_PCT) / 100) | 0)
      : move.startup;
    f.phaseLeft = startup;
    f.hitLanded = false;
  }

  function applyHit(
    attacker: InternalFighter,
    defender: InternalFighter,
    atkCorner: Corner,
    defCorner: Corner,
    move: MoveDef,
    events: BattleEvent[],
  ): void {
    const defending = defender.state === "block";
    const gap = Math.abs(attacker.x - defender.x) - BODY_GAP;

    // Dodge: walking away during the active window with enough spacing.
    // The margin scales with Reaction — sharp fighters slip at closer range.
    const movingAway =
      defender.state === "walk" &&
      ((defender.x > attacker.x && defender.knockVel >= 0) || (defender.x < attacker.x && defender.knockVel <= 0));
    const dodgeMargin = (defender.cfg.stats.reaction / 4) | 0;
    if (movingAway && gap > move.range - dodgeMargin) {
      attacker.hitLanded = true;
      box.dodged[defCorner]++;
      events.push({ tick, type: "dodged", corner: defCorner, moveId: move.id });
      // A clean slip opens a counter window sized by Reaction.
      defender.counterLeft = 6 + ((defender.cfg.stats.reaction / 8) | 0);
      return;
    }

    if (defending) {
      attacker.hitLanded = true;
      defender.hp -= move.chip; // chip damage
      defender.stamina = Math.max(0, defender.stamina - move.staminaCost / 2) | 0;
      attacker.meter = Math.min(100, attacker.meter + move.meterGain);
      defender.meter = Math.min(100, defender.meter + ((move.meterGain / 2) | 0));
      defender.counterLeft = 6 + ((defender.cfg.stats.reaction / 8) | 0);
      box.blocked[defCorner]++;
      events.push({ tick, type: "blocked", corner: atkCorner, moveId: move.id, damage: move.chip });
      return;
    }

    // Clean hit. Startup interrupt = counter hit for bonus damage.
    let damage = move.damage;
    const interrupted = defender.state === "attack" && defender.phase === "startup";
    if (interrupted) damage = (damage * (100 + COUNTER_DAMAGE_BONUS_PCT) / 100) | 0;
    if (defender.state === "gassed") damage = (damage * (100 + GASSED_DAMAGE_BONUS_PCT) / 100) | 0;

    attacker.hitLanded = true;
    defender.hp -= damage;
    defender.state = "hitstun";
    defender.moveIndex = -1;
    defender.hitstunLeft = 10 + ((move.knockback / 8) | 0);
    defender.knockVel = attacker.x < defender.x ? move.knockback : -move.knockback;
    attacker.meter = Math.min(100, attacker.meter + move.meterGain);
    defender.meter = Math.min(100, defender.meter + ((move.meterGain / 2) | 0));
    box.hits[atkCorner]++;
    events.push({
      tick,
      type: interrupted ? "counter" : "hit",
      corner: atkCorner,
      moveId: move.id,
      damage,
    });
  }

  function fighterTick(f: InternalFighter, foe: InternalFighter, input: number, corner: Corner, events: BattleEvent[]): void {
    if (f.state === "ko") return;

    // Timers
    if (f.counterLeft > 0) f.counterLeft--;

    // Knockback slide (applies even in hitstun)
    if (f.knockVel !== 0) {
      f.x += f.knockVel > 0 ? Math.min(f.knockVel, 8) : Math.max(f.knockVel, -8);
      f.knockVel = f.knockVel > 0 ? Math.max(0, f.knockVel - 8) : Math.min(0, f.knockVel + 8);
    }

    if (f.state === "hitstun") {
      f.hitstunLeft--;
      if (f.hitstunLeft <= 0) f.state = "idle";
      return;
    }

    if (f.state === "gassed") {
      f.stamina = Math.min(f.maxStamina, f.stamina + f.regen * 3); // heaving for air
      if (f.stamina >= GASSED_RECOVER_AT || f.stamina >= f.maxStamina) f.state = "idle";
      return;
    }

    if (f.state === "attack") {
      f.phaseLeft--;
      if (f.phaseLeft <= 0) {
        const move = f.moves[f.moveIndex]!;
        if (f.phase === "startup") {
          f.phase = "active";
          f.phaseLeft = move.active;
        } else if (f.phase === "active") {
          f.phase = "recovery";
          f.phaseLeft = move.recovery;
        } else {
          f.state = "idle";
          f.moveIndex = -1;
        }
      }
      // Resolve contact during active frames (one hit per swing)
      if (f.state === "attack" && f.phase === "active" && !f.hitLanded) {
        const move = f.moves[f.moveIndex]!;
        const gap = Math.abs(f.x - foe.x) - BODY_GAP;
        if (gap <= move.range && foe.state !== "ko") {
          applyHit(f, foe, corner, corner === "a" ? "b" : "a", move, events);
        }
      }
      return;
    }

    // Actionable states: idle / walk / block
    const wantsBlock = (input & INPUT.BLOCK) !== 0;
    const wantsLight = (input & INPUT.LIGHT) !== 0;
    const wantsHeavy = (input & INPUT.HEAVY) !== 0;
    const wantsSpecial = (input & INPUT.SPECIAL) !== 0;
    const dir = ((input & INPUT.RIGHT) !== 0 ? 1 : 0) - ((input & INPUT.LEFT) !== 0 ? 1 : 0);

    if (wantsSpecial && f.meter >= SPECIAL_METER_COST) {
      startMove(f, f.moves.findIndex((m) => m.slot === "special"), events, corner);
      return;
    }
    if (wantsSpecial) {
      // Button 4 without a full meter falls back to the grapple tool.
      startMove(f, f.moves.findIndex((m) => m.slot === "grapple"), events, corner);
      return;
    }
    if (wantsHeavy) {
      startMove(f, f.moves.findIndex((m) => m.slot === "heavy"), events, corner);
      return;
    }
    if (wantsLight) {
      startMove(f, f.moves.findIndex((m) => m.slot === "light"), events, corner);
      return;
    }

    if (wantsBlock) {
      f.state = "block";
      f.stamina = Math.max(0, f.stamina - BLOCK_STAMINA_DRAIN);
      if (f.stamina === 0) {
        f.state = "gassed";
        events.push({ tick, type: "gassed", corner });
      }
      return;
    }

    if (dir !== 0) {
      f.state = "walk";
      f.x += dir * f.walkSpeed;
    } else {
      f.state = "idle";
    }
    // Passive recovery when not attacking or blocking
    f.stamina = Math.min(f.maxStamina, f.stamina + f.regen);
  }

  function endRound(events: BattleEvent[], byKo: Corner | null): void {
    // byKo names the WINNER when the round ended on a knockout.
    let winner: Corner | "draw";
    if (byKo) winner = byKo;
    else if (a.hp > b.hp) winner = "a";
    else if (b.hp > a.hp) winner = "b";
    else winner = "draw";
    if (winner !== "draw") fighters[winner].roundWins++;
    roundResults.push({ winner, aHp: Math.max(0, a.hp), bHp: Math.max(0, b.hp) });
    events.push({ tick, type: "round_end", round, winner });

    const matchOver = byKo !== null || round >= rules.rounds;
    if (matchOver) {
      if (byKo) {
        matchWinner = byKo;
        koRound = round;
      } else {
        matchWinner = a.roundWins > b.roundWins ? "a" : b.roundWins > a.roundWins ? "b" : "draw";
      }
      done = true;
      events.push({ tick, type: "match_end", winner: matchWinner });
    } else {
      round++;
      roundTick = 0;
      resetForRound();
      events.push({ tick, type: "round_start", round });
    }
  }

  function step(inputA: number, inputB: number): StepResult {
    if (done) return { tick, round, done, events: [], a: view(a), b: view(b) };

    const events: BattleEvent[] = [];
    if (tick === 0) events.push({ tick, type: "round_start", round: 1 });
    tick++;
    roundTick++;

    fighterTick(a, b, inputA & 63, "a", events);
    fighterTick(b, a, inputB & 63, "b", events);

    // Body collision + arena walls
    if (Math.abs(a.x - b.x) < BODY_GAP) {
      const mid = ((a.x + b.x) / 2) | 0;
      if (a.x <= b.x) {
        a.x = mid - BODY_GAP / 2;
        b.x = mid + BODY_GAP / 2;
      } else {
        a.x = mid + BODY_GAP / 2;
        b.x = mid - BODY_GAP / 2;
      }
    }
    a.x = Math.max(ARENA_MIN, Math.min(ARENA_MAX, a.x)) | 0;
    b.x = Math.max(ARENA_MIN, Math.min(ARENA_MAX, b.x)) | 0;
    a.facing = a.x <= b.x ? 1 : -1;
    b.facing = b.x < a.x ? 1 : -1;

    // KO check
    let ko: Corner | null = null;
    if (a.hp <= 0 && b.hp <= 0) ko = a.hp <= b.hp ? "b" : "a"; // rarer double-down: bigger deficit loses
    else if (a.hp <= 0) ko = "b";
    else if (b.hp <= 0) ko = "a";
    if (ko) {
      const loser = ko === "a" ? b : a;
      loser.state = "ko";
      events.push({ tick, type: "ko", corner: ko === "a" ? "b" : "a" });
      endRound(events, ko);
    } else if (roundTick >= rules.ticksPerRound) {
      endRound(events, null);
    }

    // Fold integer state into the rolling hash. Order matters: it is the wire format.
    hash = rollingHash(hash, [
      tick,
      a.x, a.hp, a.stamina, a.meter, STATE_ORD[a.state],
      b.x, b.hp, b.stamina, b.meter, STATE_ORD[b.state],
      events.length,
    ]);

    return { tick, round, done, events, a: view(a), b: view(b) };
  }

  function result(): MatchResult {
    return {
      winner: matchWinner,
      rounds: roundResults,
      koRound,
      ticksSimulated: tick,
      hash,
      boxScore: { ...box, koRound },
    };
  }

  return { step, result, config };
}

/**
 * Server-side replay (and headless client sim): a thin loop over the same
 * core. Inputs are per-tick bitmask arrays for both corners.
 */
export function runMatch(
  config: BattleConfig,
  inputs: { a: readonly number[]; b: readonly number[] },
): MatchResult {
  const battle = createBattle(config);
  const total = config.rules.rounds * config.rules.ticksPerRound;
  for (let t = 0; t < total; t++) {
    const res = battle.step(inputs.a[t] ?? 0, inputs.b[t] ?? 0);
    if (res.done) break;
  }
  return battle.result();
}
