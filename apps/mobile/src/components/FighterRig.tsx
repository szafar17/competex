/**
 * Ink-line fighter rig rendered with react-native-svg, posed per engine tick.
 * Coordinates come from fighter-pose.ts in local space (feet origin, y up);
 * we map into the parent SVG's arena space here.
 */

import React from "react";
import { Circle, G, Line, Path } from "react-native-svg";
import type { FighterView } from "@cx/battle-engine";
import { poseFor, type Pt } from "../lib/fighter-pose";

interface Props {
  view: FighterView;
  tick: number;
  /** Arena-space x already scaled to SVG units. */
  x: number;
  groundY: number;
  color: string;
  accent: string;
}

export function FighterRig({ view, tick, x, groundY, color, accent }: Props): React.JSX.Element {
  const pose = poseFor(view, tick);
  const flip = view.facing === 1 ? 1 : -1;
  const px = (p: Pt) => x + p[0] * flip * 0.55;
  const py = (p: Pt) => groundY - p[1] * 0.55;

  const stroke = view.state === "hitstun" ? accent : color;
  const sw = 4;
  const headR = 9;

  const limb = (a: Pt, b: Pt, key: string) => (
    <Line key={key} x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
  );

  return (
    <G opacity={view.state === "ko" ? 0.65 : 1}>
      {/* shadow */}
      <Path
        d={`M ${x - 22} ${groundY + 4} a 22 6 0 1 0 44 0 a 22 6 0 1 0 -44 0`}
        fill={color}
        opacity={0.12}
      />
      {limb(pose.hip, pose.shoulder, "torso")}
      {limb(pose.shoulder, pose.handF, "armF")}
      {limb(pose.shoulder, pose.handB, "armB")}
      {limb(pose.hip, pose.footF, "legF")}
      {limb(pose.hip, pose.footB, "legB")}
      <Circle cx={px(pose.head)} cy={py(pose.head)} r={headR} stroke={stroke} strokeWidth={sw} fill="none" />
      {/* gloves read better than bare line ends */}
      <Circle cx={px(pose.handF)} cy={py(pose.handF)} r={4.5} fill={accent} />
      <Circle cx={px(pose.handB)} cy={py(pose.handB)} r={4.5} fill={accent} />
      {view.counterWindow && (
        <Circle cx={px(pose.head)} cy={py(pose.head)} r={headR + 5} stroke={accent} strokeWidth={1.5} fill="none" opacity={0.8} />
      )}
    </G>
  );
}
