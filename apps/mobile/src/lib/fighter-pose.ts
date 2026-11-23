/**
 * Pose-keyframed fighter rig.
 *
 * The engine's per-tick FighterView (state + move phase + phaseProgress)
 * drives interpolation between hand-tuned keyframe poses. Floats are fine
 * here — this is render-only and never feeds back into engine state.
 *
 * Local space: origin at the feet, +x toward the opponent, y up, ~170 tall.
 */

import type { FighterView, MovePhase } from "@cx/battle-engine";

export type Pt = [number, number];

export interface Pose {
  head: Pt;
  shoulder: Pt;
  hip: Pt;
  handF: Pt; // lead hand
  handB: Pt; // rear hand
  footF: Pt;
  footB: Pt;
}

const IDLE: Pose = {
  head: [4, 152],
  shoulder: [2, 122],
  hip: [0, 78],
  handF: [30, 118],
  handB: [18, 106],
  footF: [22, 0],
  footB: [-18, 0],
};

const WALK: Pose = {
  ...IDLE,
  head: [8, 151],
  shoulder: [6, 121],
  footF: [34, 0],
  footB: [-26, 0],
};

const BLOCK: Pose = {
  ...IDLE,
  head: [0, 148],
  shoulder: [-2, 119],
  handF: [16, 138],
  handB: [10, 128],
};

const HITSTUN: Pose = {
  head: [-16, 146],
  shoulder: [-12, 118],
  hip: [-4, 76],
  handF: [6, 96],
  handB: [-14, 100],
  footF: [14, 0],
  footB: [-26, 0],
};

const GASSED: Pose = {
  head: [10, 132],
  shoulder: [8, 106],
  hip: [0, 72],
  handF: [22, 78],
  handB: [10, 74],
  footF: [22, 0],
  footB: [-18, 0],
};

const KO: Pose = {
  head: [-52, 14],
  shoulder: [-34, 12],
  hip: [0, 10],
  handF: [-20, 2],
  handB: [-46, 4],
  footF: [30, 4],
  footB: [16, 2],
};

/** Per-slot attack keyframes: windup (end of startup) and extended (active). */
const ATTACKS: Record<string, { windup: Pose; extended: Pose }> = {
  light: {
    windup: { ...IDLE, handF: [14, 116], shoulder: [-2, 121] },
    extended: { ...IDLE, head: [10, 150], shoulder: [10, 122], handF: [62, 124], handB: [8, 104] },
  },
  heavy: {
    windup: { ...IDLE, head: [-6, 150], shoulder: [-8, 120], handB: [-12, 110], hip: [-4, 78] },
    extended: { ...IDLE, head: [16, 148], shoulder: [14, 120], handB: [66, 116], handF: [22, 112], hip: [8, 78], footB: [-10, 0] },
  },
  grapple: {
    windup: { ...IDLE, head: [2, 144], shoulder: [0, 114], hip: [-2, 72], handF: [26, 100], handB: [22, 96] },
    extended: { ...IDLE, head: [22, 138], shoulder: [20, 110], hip: [10, 70], handF: [54, 96], handB: [50, 104], footF: [36, 0] },
  },
  special: {
    windup: { ...IDLE, head: [-8, 154], shoulder: [-6, 124], handF: [10, 130], handB: [-6, 126] },
    extended: { ...IDLE, head: [14, 152], shoulder: [14, 124], handF: [68, 130], handB: [58, 112], footF: [30, 0], footB: [-8, 0] },
  },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const p = (k: keyof Pose): Pt => [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t)];
  return { head: p("head"), shoulder: p("shoulder"), hip: p("hip"), handF: p("handF"), handB: p("handB"), footF: p("footF"), footB: p("footB") };
}

function slotOf(moveId: string | null): string {
  return moveId?.split(".")[1] ?? "light";
}

function attackPose(moveId: string | null, phase: MovePhase | null, progress: number): Pose {
  const kit = ATTACKS[slotOf(moveId)] ?? ATTACKS.light;
  const t = progress / 100;
  if (phase === "startup") return lerpPose(IDLE, kit.windup, t);
  if (phase === "active") return lerpPose(kit.windup, kit.extended, Math.min(1, t * 2));
  return lerpPose(kit.extended, IDLE, t);
}

/** A subtle two-beat breathing bob for idle/walk, keyed off the tick. */
function bob(pose: Pose, tick: number, amount = 2): Pose {
  const dy = Math.sin(tick / 14) * amount;
  const lift = (pt: Pt): Pt => [pt[0], pt[1] + dy];
  return { ...pose, head: lift(pose.head), shoulder: lift(pose.shoulder), handF: lift(pose.handF), handB: lift(pose.handB) };
}

export function poseFor(view: FighterView, tick: number): Pose {
  switch (view.state) {
    case "attack":
      return attackPose(view.moveId, view.movePhase, view.phaseProgress);
    case "block":
      return BLOCK;
    case "hitstun":
      return HITSTUN;
    case "gassed":
      return bob(GASSED, tick, 4);
    case "ko":
      return KO;
    case "walk":
      return bob(lerpPose(IDLE, WALK, (Math.sin(tick / 5) + 1) / 2), tick);
    default:
      return bob(IDLE, tick);
  }
}
