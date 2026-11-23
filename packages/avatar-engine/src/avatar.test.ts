import { describe, expect, it } from "vitest";
import { AVATAR_VARIANTS } from "@cx/shared";
import { avatarSvgForSeed, buildRig, landmarksFromSeed } from "./index.js";

describe("avatar engine", () => {
  it("is deterministic for the same seed", () => {
    expect(avatarSvgForSeed("demo-user", "inkline")).toBe(avatarSvgForSeed("demo-user", "inkline"));
  });

  it("differs across seeds and variants", () => {
    expect(avatarSvgForSeed("alice", "inkline")).not.toBe(avatarSvgForSeed("bob", "inkline"));
    expect(avatarSvgForSeed("alice", "inkline")).not.toBe(avatarSvgForSeed("alice", "brush"));
  });

  it("produces a valid layered rig for every variant", () => {
    for (const variant of AVATAR_VARIANTS) {
      const rig = buildRig(landmarksFromSeed("test"), variant);
      expect(rig.layers.length).toBeGreaterThanOrEqual(5);
      for (const layer of rig.layers) {
        expect(layer.d.startsWith("M ")).toBe(true);
        expect(layer.d).not.toContain("NaN");
      }
    }
  });
});
