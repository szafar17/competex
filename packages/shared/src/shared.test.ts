import { describe, expect, it } from "vitest";
import { mulberry32, rollingHash, stringSeed } from "./rng.js";
import { computeStats, defaultStats, eloDelta, softCap, type WorkoutForStats } from "./stats.js";
import { mixMoveset } from "./disciplines.js";

describe("rng", () => {
  it("mulberry32 is deterministic per seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stringSeed + rollingHash are stable", () => {
    expect(stringSeed("competex")).toBe(stringSeed("competex"));
    const h1 = rollingHash(0x811c9dc5, [1, 2, 3]);
    expect(h1).toBe(rollingHash(0x811c9dc5, [1, 2, 3]));
    expect(h1).not.toBe(rollingHash(0x811c9dc5, [1, 2, 4]));
  });
});

describe("stats", () => {
  const now = new Date("2026-06-11T12:00:00Z");
  const session = (daysAgo: number, durationMin = 60, intensity = 7): WorkoutForStats => ({
    kind: "sparring",
    startedAt: new Date(now.getTime() - daysAgo * 86_400_000),
    durationMin,
    intensity,
  });

  it("soft cap is monotonic and bounded", () => {
    expect(softCap(0)).toBe(20);
    expect(softCap(500)).toBeGreaterThan(softCap(100));
    expect(softCap(1_000_000)).toBeLessThanOrEqual(99);
  });

  it("training raises stats above the default", () => {
    const stats = computeStats([session(1), session(2), session(3)], now);
    expect(stats.reaction).toBeGreaterThan(defaultStats().reaction);
  });

  it("big-gap reflection rebate keeps pre-gap work alive", () => {
    // Same volume, 20 days old. In one timeline the user came back after a
    // 10-day gap (rebate applies); in the other they never left (no gap, so
    // old work just decays with recency).
    const withComeback = computeStats([session(20, 90, 9), session(20.5, 90, 9), session(1, 10, 3)], now);
    const noComeback = computeStats([session(20, 90, 9), session(20.5, 90, 9), session(15, 10, 3)], now);
    expect(withComeback.reaction).toBeGreaterThanOrEqual(noComeback.reaction);
  });

  it("elo delta is symmetric-ish and K-bounded", () => {
    expect(eloDelta(1000, 1000, 1, 24)).toBe(12);
    expect(eloDelta(1000, 1000, 0, 24)).toBe(-12);
    expect(Math.abs(eloDelta(800, 1600, 1, 24))).toBeLessThanOrEqual(24);
  });
});

describe("disciplines", () => {
  it("mixes one move per slot from the declared disciplines", () => {
    const kit = mixMoveset(["boxing", "bjj"], defaultStats());
    expect(kit.map((m) => m.slot)).toEqual(["light", "heavy", "grapple", "special"]);
    expect(kit[0]!.discipline).toBe("boxing");
    expect(kit[1]!.discipline).toBe("bjj");
  });

  it("higher power scales damage", () => {
    const weak = mixMoveset(["boxing"], { ...defaultStats(), power: 20 });
    const strong = mixMoveset(["boxing"], { ...defaultStats(), power: 90 });
    expect(strong[1]!.damage).toBeGreaterThan(weak[1]!.damage);
  });
});
