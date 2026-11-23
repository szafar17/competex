/**
 * Seeded deterministic CPU bot.
 *
 * The bot lives OUTSIDE the engine core: the caller asks it for an input
 * bitmask each tick and feeds that into step() exactly like a human's input.
 * Given the same seed and the same fight, it always produces the same input
 * stream — which is why the server can replay a practice match from the
 * recorded inputs alone, without re-running the bot.
 */

import { mulberry32 } from "@cx/shared";
import { INPUT, type Corner, type FighterView } from "./types.js";

export type BotFn = (self: FighterView, foe: FighterView, tick: number) => number;

/** Personality knobs derived from the seed — every bot fights a little differently. */
export function createBot(seed: number, corner: Corner): BotFn {
  const rand = mulberry32(seed ^ (corner === "a" ? 0xa11ce : 0xb0b));
  const aggression = 0.35 + rand() * 0.4; // chance to swing when in range
  const caution = 0.15 + rand() * 0.25; // chance to block instead
  const preferredRange = 90 + ((rand() * 50) | 0);

  let committedUntil = 0;
  let committedInput = 0;

  return (self, foe, tick) => {
    if (self.state === "ko" || foe.state === "ko") return 0;
    // While attacking / stunned the engine ignores inputs anyway; release everything.
    if (self.state === "attack" || self.state === "hitstun" || self.state === "gassed") return 0;

    // Honor short input commitments so movement reads as intentional, not jittery.
    if (tick < committedUntil) return committedInput;

    const towardFoe = foe.x > self.x ? INPUT.RIGHT : INPUT.LEFT;
    const awayFromFoe = foe.x > self.x ? INPUT.LEFT : INPUT.RIGHT;
    const gap = Math.abs(self.x - foe.x) - 80;

    // Low stamina: back off and breathe.
    if (self.stamina < self.maxStamina / 5) {
      committedInput = awayFromFoe;
      committedUntil = tick + 18;
      return committedInput;
    }

    // Full meter: spend it the moment we are in range.
    if (self.meter >= 100 && gap <= preferredRange) return INPUT.SPECIAL;

    // Foe mid-swing: block or try to slip out.
    if (foe.state === "attack" && rand() < 0.5 + caution) {
      if (rand() < caution * 2) {
        committedInput = awayFromFoe;
        committedUntil = tick + 6;
        return committedInput;
      }
      return INPUT.BLOCK;
    }

    // Counter window open: punish immediately.
    if (self.counterWindow && gap <= preferredRange + 30) {
      return rand() < 0.5 ? INPUT.HEAVY : INPUT.LIGHT;
    }

    if (gap > preferredRange) {
      committedInput = towardFoe;
      committedUntil = tick + 8;
      return committedInput;
    }

    // In range: mix it up.
    const roll = rand();
    if (roll < aggression * 0.55) return INPUT.LIGHT;
    if (roll < aggression) return INPUT.HEAVY;
    if (roll < aggression + 0.12) return INPUT.SPECIAL; // grapple fallback when meter is low
    if (roll < aggression + 0.12 + caution) return INPUT.BLOCK;

    // Footsies: drift in and out.
    committedInput = rand() < 0.6 ? towardFoe : awayFromFoe;
    committedUntil = tick + 5;
    return committedInput;
  };
}
