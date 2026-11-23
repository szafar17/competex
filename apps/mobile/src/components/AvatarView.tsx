import React, { useMemo } from "react";
import { SvgXml } from "react-native-svg";
import { avatarSvgForSeed } from "@cx/avatar-engine";
import type { AvatarVariant } from "@cx/shared";

interface Props {
  /** Server-rendered SVG wins; otherwise generate locally from the seed. */
  svg?: string | null;
  seed?: string;
  variant?: AvatarVariant;
  size?: number;
}

export function AvatarView({ svg, seed = "fighter", variant = "inkline", size = 96 }: Props): React.JSX.Element {
  const xml = useMemo(() => svg ?? avatarSvgForSeed(seed, variant), [svg, seed, variant]);
  return <SvgXml xml={xml} width={size} height={size} />;
}
