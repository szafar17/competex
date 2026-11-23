/**
 * Live fight scene. Steps the deterministic engine at 60Hz inside a rAF loop,
 * renders the pose-animated SVG rigs, records every input frame for both
 * corners, then submits the replay (inputs + rolling hash) for server
 * validation.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import Svg, { Line, Rect } from "react-native-svg";
import { createBattle, createBot, INPUT, type StepResult } from "@cx/battle-engine";
import type { BattleResult } from "@cx/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useBattle } from "@/lib/battle-store";
import { colors, spacing } from "@/lib/theme";
import { FighterRig } from "@/components/FighterRig";
import { Button, Screen } from "@/components/ui";

const ARENA_W = 1000;

export default function MatchScreen(): React.JSX.Element {
  const find = useBattle((s) => s.find);
  const finishLocal = useBattle((s) => s.finishLocal);
  const setSubmission = useBattle((s) => s.setSubmission);
  const refreshMe = useAuth((s) => s.refreshMe);
  const { width } = useWindowDimensions();

  const [frame, setFrame] = useState<StepResult | null>(null);
  const [banner, setBanner] = useState<string | null>("ROUND 1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Held controls live in refs — read fresh every engine tick.
  const heldDir = useRef(0);
  const heldBlock = useRef(false);
  const queued = useRef(0);

  const sim = useMemo(() => {
    if (!find) return null;
    const battle = createBattle({
      seed: find.seed,
      a: { stats: find.you.stats, disciplines: find.you.disciplines },
      b: { stats: find.opponent.stats, disciplines: find.opponent.disciplines },
      rules: find.rules,
    });
    return { battle, bot: createBot(find.seed, "b" as const), inputs: { a: [] as number[], b: [] as number[] } };
  }, [find]);

  useEffect(() => {
    if (!sim || !find) return;
    let raf = 0;
    let last: StepResult | null = null;
    let bannerTimer: ReturnType<typeof setTimeout> | null = null;

    const loop = (): void => {
      if (!last || !last.done) {
        // Player input for this tick: held direction + held block + queued taps.
        let ia = 0;
        if (heldDir.current < 0) ia |= INPUT.LEFT;
        if (heldDir.current > 0) ia |= INPUT.RIGHT;
        if (heldBlock.current) ia |= INPUT.BLOCK;
        ia |= queued.current;
        queued.current = 0;

        const ib = last ? sim.bot(last.b, last.a, last.tick) : 0;
        sim.inputs.a.push(ia);
        sim.inputs.b.push(ib);
        const res = sim.battle.step(ia, ib);
        last = res;
        setFrame(res);

        for (const ev of res.events) {
          if (ev.type === "round_start" && ev.round && ev.round > 1) {
            setBanner(`ROUND ${ev.round}`);
            bannerTimer = setTimeout(() => setBanner(null), 1200);
          }
          if (ev.type === "ko") setBanner("KO!");
        }

        if (res.done) {
          const result = sim.battle.result();
          finishLocal(result, sim.inputs);
          setBanner(result.winner === "a" ? "YOU WIN" : result.winner === "b" ? "YOU LOSE" : "DRAW");
          setSubmitting(true);
          void api<BattleResult>("POST", "/v1/battle/submit", {
            matchId: find.matchId,
            inputs: sim.inputs,
            hash: result.hash,
          })
            .then(async (submission) => {
              setSubmission(submission);
              await refreshMe().catch(() => undefined);
              router.replace("/battle/postfight");
            })
            .catch((e: unknown) => {
              setError(e instanceof Error ? e.message : "submit failed");
            })
            .finally(() => setSubmitting(false));
          return; // stop the loop
        }
      }
      raf = requestAnimationFrame(loop);
    };

    const opening = setTimeout(() => setBanner(null), 1000);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(opening);
      if (bannerTimer) clearTimeout(bannerTimer);
    };
  }, [sim, find, finishLocal, setSubmission, refreshMe]);

  if (!find || !sim) {
    return (
      <Screen style={{ justifyContent: "center" }}>
        <Text style={{ color: colors.ink, textAlign: "center" }}>No fight staged.</Text>
        <Button title="Back" onPress={() => router.replace("/(tabs)/battle")} />
      </Screen>
    );
  }

  const sceneW = width - spacing(4) * 2;
  const sceneH = 240;
  const groundY = sceneH - 28;
  const scale = sceneW / ARENA_W;

  return (
    <Screen style={{ padding: spacing(4) }}>
      {/* HUD */}
      <View style={styles.hud}>
        <HudBar label={`@${find.you.handle}`} view={frame?.a} color={colors.accent} flip={false} />
        <Text style={styles.round}>R{frame?.round ?? 1}</Text>
        <HudBar label={`@${find.opponent.handle}`} view={frame?.b} color={colors.blue} flip />
      </View>

      {/* Arena */}
      <View style={styles.arena}>
        <Svg width={sceneW} height={sceneH}>
          <Line x1={0} y1={groundY + 6} x2={sceneW} y2={groundY + 6} stroke={colors.line} strokeWidth={2} />
          <Rect x={0} y={groundY + 10} width={sceneW} height={4} fill={colors.surfaceRaised} />
          {frame && (
            <>
              <FighterRig view={frame.a} tick={frame.tick} x={frame.a.x * scale} groundY={groundY} color={colors.ink} accent={colors.accent} />
              <FighterRig view={frame.b} tick={frame.tick} x={frame.b.x * scale} groundY={groundY} color={colors.inkDim} accent={colors.blue} />
            </>
          )}
        </Svg>
        {banner && (
          <View style={styles.bannerWrap} pointerEvents="none">
            <Text style={styles.banner}>{banner}</Text>
          </View>
        )}
        {error && (
          <View style={styles.bannerWrap}>
            <Text style={[styles.banner, { fontSize: 16, color: colors.red }]}>{error}</Text>
            <Button title="Back to Battle" onPress={() => router.replace("/(tabs)/battle")} />
          </View>
        )}
        {submitting && !error && <Text style={styles.submitting}>verifying replay…</Text>}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.moveRow}>
          <HoldPad label="◀" onChange={(d) => (heldDir.current = d ? -1 : heldDir.current === -1 ? 0 : heldDir.current)} />
          <HoldPad label="▶" onChange={(d) => (heldDir.current = d ? 1 : heldDir.current === 1 ? 0 : heldDir.current)} />
        </View>
        <View style={styles.btnRow}>
          <TapBtn label="JAB" color={colors.accent} onTap={() => (queued.current |= INPUT.LIGHT)} />
          <TapBtn label="POWER" color={colors.accentSoft} onTap={() => (queued.current |= INPUT.HEAVY)} />
          <HoldBtn label="BLOCK" color={colors.blue} onChange={(d) => (heldBlock.current = d)} />
          <TapBtn
            label={`SPCL ${frame ? Math.min(100, frame.a.meter) : 0}%`}
            color={colors.gold}
            onTap={() => (queued.current |= INPUT.SPECIAL)}
          />
        </View>
      </View>
    </Screen>
  );
}

function HudBar({
  label,
  view,
  color,
  flip,
}: {
  label: string;
  view: StepResult["a"] | undefined;
  color: string;
  flip: boolean;
}): React.JSX.Element {
  const hp = view ? Math.max(0, view.hp / view.maxHp) : 1;
  const st = view ? Math.max(0, view.stamina / view.maxStamina) : 1;
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.hudLabel, flip && { textAlign: "right" }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${hp * 100}%`, backgroundColor: color, alignSelf: flip ? "flex-end" : "flex-start" }]} />
      </View>
      <View style={[styles.barTrack, { height: 4, marginTop: 2 }]}>
        <View style={[styles.barFill, { width: `${st * 100}%`, backgroundColor: colors.green, alignSelf: flip ? "flex-end" : "flex-start" }]} />
      </View>
    </View>
  );
}

function HoldPad({ label, onChange }: { label: string; onChange: (down: boolean) => void }): React.JSX.Element {
  return (
    <Pressable style={({ pressed }) => [styles.pad, pressed && styles.padOn]} onPressIn={() => onChange(true)} onPressOut={() => onChange(false)}>
      <Text style={styles.padText}>{label}</Text>
    </Pressable>
  );
}

function TapBtn({ label, color, onTap }: { label: string; color: string; onTap: () => void }): React.JSX.Element {
  return (
    <Pressable style={({ pressed }) => [styles.actBtn, { borderColor: color }, pressed && { backgroundColor: color }]} onPress={onTap}>
      <Text style={styles.actText}>{label}</Text>
    </Pressable>
  );
}

function HoldBtn({ label, color, onChange }: { label: string; color: string; onChange: (down: boolean) => void }): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [styles.actBtn, { borderColor: color }, pressed && { backgroundColor: color }]}
      onPressIn={() => onChange(true)}
      onPressOut={() => onChange(false)}
    >
      <Text style={styles.actText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hud: { flexDirection: "row", alignItems: "center", gap: spacing(3), marginTop: spacing(2) },
  hudLabel: { color: colors.inkDim, fontSize: 11, fontWeight: "800", marginBottom: 3 },
  round: { color: colors.ink, fontWeight: "900", fontSize: 16 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  arena: {
    marginTop: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  bannerWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  banner: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: 3 },
  submitting: { position: "absolute", bottom: 6, alignSelf: "center", color: colors.inkDim, fontSize: 11 },
  controls: { marginTop: "auto", marginBottom: spacing(2) },
  moveRow: { flexDirection: "row", gap: spacing(3) },
  pad: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: spacing(3.5),
  },
  padOn: { backgroundColor: colors.surfaceRaised },
  padText: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  btnRow: { flexDirection: "row", gap: spacing(2), marginTop: spacing(2.5) },
  actBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: spacing(4),
    backgroundColor: colors.surface,
  },
  actText: { color: colors.ink, fontWeight: "900", fontSize: 12, letterSpacing: 0.5 },
});
