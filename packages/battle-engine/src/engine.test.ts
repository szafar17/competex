import { describe, expect, it } from "vitest";
import { MATCH_RULES, defaultStats, type StatVector } from "@cx/shared";
import { createBattle, runMatch } from "./engine.js";
import { createBot } from "./bot.js";
import type { BattleConfig } from "./types.js";

function config(seed: number, aStats?: Partial<StatVector>, bStats?: Partial<StatVector>): BattleConfig {
  return {
    seed,
    a: { stats: { ...defaultStats(), ...aStats }, disciplines: ["boxing", "muay_thai"] },
    b: { stats: { ...defaultStats(), ...bStats }, disciplines: ["wrestling", "bjj"] },
    rules: MATCH_RULES,
  };
}

/** Simulate with bots driving both corners; record inputs like the client does. */
function simulate(cfg: BattleConfig) {
  const botA = createBot(cfg.seed, "a");
  const botB = createBot(cfg.seed, "b");
  const battle = createBattle(cfg);
  const inputs = { a: [] as number[], b: [] as number[] };
  let viewA = battle.step(0, 0); // tick 1, neutral
  inputs.a.push(0);
  inputs.b.push(0);
  while (!viewA.done) {
    const ia = botA(viewA.a, viewA.b, viewA.tick);
    const ib = botB(viewA.b, viewA.a, viewA.tick);
    inputs.a.push(ia);
    inputs.b.push(ib);
    viewA = battle.step(ia, ib);
  }
  return { result: battle.result(), inputs };
}

describe("battle engine determinism", () => {
  it("replaying recorded inputs reproduces the exact rolling hash", () => {
    const cfg = config(123456789);
    const { result, inputs } = simulate(cfg);
    const replay = runMatch(cfg, inputs);
    expect(replay.hash).toBe(result.hash);
    expect(replay.winner).toBe(result.winner);
    expect(replay.ticksSimulated).toBe(result.ticksSimulated);
    expect(replay.rounds).toEqual(result.rounds);
  });

  it("different seeds produce different fights", () => {
    const r1 = simulate(config(1)).result;
    const r2 = simulate(config(2)).result;
    expect(r1.hash).not.toBe(r2.hash);
  });

  it("tampered inputs change the hash (anti-cheat)", () => {
    const cfg = config(42);
    const { result, inputs } = simulate(cfg);
    const tampered = { a: [...inputs.a], b: [...inputs.b] };
    tampered.a[50] = 8; // sneak in a heavy
    const replay = runMatch(cfg, tampered);
    expect(replay.hash).not.toBe(result.hash);
  });

  it("a heavily stat-advantaged fighter usually wins", () => {
    let wins = 0;
    for (let seed = 100; seed < 110; seed++) {
      const cfg = config(seed, { power: 90, speed: 85, technique: 88, reaction: 85, endurance: 90, willpower: 80 });
      const { result } = simulate(cfg);
      if (result.winner === "a") wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(7);
  });

  it("fights end within the canonical tick budget", () => {
    const { result } = simulate(config(777));
    expect(result.ticksSimulated).toBeLessThanOrEqual(MATCH_RULES.rounds * MATCH_RULES.ticksPerRound);
    expect(result.rounds.length).toBeGreaterThanOrEqual(1);
    expect(result.rounds.length).toBeLessThanOrEqual(MATCH_RULES.rounds);
  });

  it("integer-only persisted state every tick", () => {
    const cfg = config(31337);
    const battle = createBattle(cfg);
    const botA = createBot(cfg.seed, "a");
    const botB = createBot(cfg.seed, "b");
    let res = battle.step(0, 0);
    for (let i = 0; i < 400 && !res.done; i++) {
      for (const f of [res.a, res.b]) {
        expect(Number.isInteger(f.x)).toBe(true);
        expect(Number.isInteger(f.hp)).toBe(true);
        expect(Number.isInteger(f.stamina)).toBe(true);
        expect(Number.isInteger(f.meter)).toBe(true);
      }
      res = battle.step(botA(res.a, res.b, res.tick), botB(res.b, res.a, res.tick));
    }
  });
});
