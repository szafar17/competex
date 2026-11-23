/**
 * Deterministic RNG + hashing utilities.
 *
 * Everything in here is integer / uint32 math so results are identical across
 * JS engines (Hermes, V8, JSC) — a hard requirement for client/server replay.
 */

/** mulberry32 — tiny, fast, deterministic PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string → uint32 seed. */
export function stringSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Rolling hash over a stream of integers. Feed it the same integers in the
 * same order on client and server and the final value matches byte-for-byte.
 */
export function rollingHash(prev: number, values: readonly number[]): number {
  let h = prev >>> 0;
  for (let i = 0; i < values.length; i++) {
    // values may be negative (e.g. knockback velocity) — normalize to uint32
    const v = (values[i]! | 0) >>> 0;
    h ^= v;
    h = Math.imul(h, 0x01000193);
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return h >>> 0;
}

export const HASH_SEED = 0x811c9dc5;
