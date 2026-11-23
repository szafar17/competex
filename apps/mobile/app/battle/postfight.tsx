/** Box score, ELO delta, share to feed. */

import React, { useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useBattle } from "@/lib/battle-store";
import { colors, spacing } from "@/lib/theme";
import { Button, Card, Screen } from "@/components/ui";

export default function PostfightScreen(): React.JSX.Element {
  const find = useBattle((s) => s.find);
  const submission = useBattle((s) => s.submission);
  const reset = useBattle((s) => s.reset);
  const [shared, setShared] = useState(false);

  if (!find || !submission) {
    return (
      <Screen style={{ justifyContent: "center" }}>
        <Text style={styles.headline}>No result</Text>
        <Button title="Back to Battle" onPress={() => router.replace("/(tabs)/battle")} />
      </Screen>
    );
  }

  const won = submission.winner === "a";
  const draw = submission.winner === "draw";
  const headline = draw ? "DRAW" : won ? "VICTORY" : "DEFEAT";
  const summary = `${headline} vs @${find.opponent.handle} (${find.kind})${
    submission.eloDelta !== 0 ? ` · ${submission.eloDelta > 0 ? "+" : ""}${submission.eloDelta} ELO` : ""
  }`;

  async function shareToFeed(): Promise<void> {
    await api("POST", "/v1/feed", { kind: "match", body: summary });
    setShared(true);
  }

  function done(): void {
    reset();
    router.replace("/(tabs)/battle");
  }

  return (
    <Screen style={{ justifyContent: "center" }}>
      <Text style={[styles.headline, { color: draw ? colors.gold : won ? colors.green : colors.red }]}>{headline}</Text>
      <Text style={styles.sub}>
        vs @{find.opponent.handle} · {find.kind}
        {submission.eloDelta !== 0 && (
          <Text style={{ color: submission.eloDelta > 0 ? colors.green : colors.red }}>
            {"  "}{submission.eloDelta > 0 ? "+" : ""}{submission.eloDelta} ELO → {submission.newRating}
          </Text>
        )}
      </Text>

      <Card>
        <Text style={styles.cardTitle}>ROUNDS</Text>
        {submission.rounds.map((r, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rowLabel}>Round {i + 1}</Text>
            <Text style={[styles.rowValue, { color: r.winner === "a" ? colors.green : r.winner === "b" ? colors.red : colors.gold }]}>
              {r.winner === "a" ? "YOU" : r.winner === "b" ? "THEM" : "EVEN"}
            </Text>
            <Text style={styles.rowMeta}>
              {Math.max(0, Math.round(r.aHp / 10))} – {Math.max(0, Math.round(r.bHp / 10))} hp
            </Text>
          </View>
        ))}
        {submission.boxScore.koRound != null && <Text style={styles.ko}>Finished by KO in round {submission.boxScore.koRound}</Text>}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>BOX SCORE · YOU / THEM</Text>
        <ScoreRow label="Clean hits" a={submission.boxScore.hits.a} b={submission.boxScore.hits.b} />
        <ScoreRow label="Blocked" a={submission.boxScore.blocked.a} b={submission.boxScore.blocked.b} />
        <ScoreRow label="Dodged" a={submission.boxScore.dodged.a} b={submission.boxScore.dodged.b} />
        <ScoreRow label="Specials" a={submission.boxScore.specials.a} b={submission.boxScore.specials.b} />
      </Card>

      <Button title={shared ? "Shared ✓" : "Share to feed"} onPress={() => void shareToFeed()} disabled={shared} />
      <Button
        title="Share off-app"
        variant="ghost"
        onPress={() => void Share.share({ message: `${summary} — CompeteX` }).catch(() => undefined)}
      />
      <Button title="Done" variant="ghost" onPress={done} />
    </Screen>
  );
}

function ScoreRow({ label, a, b }: { label: string; a: number; b: number }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>
        {a} / {b}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { color: colors.ink, fontSize: 40, fontWeight: "900", textAlign: "center", letterSpacing: 4 },
  sub: { color: colors.inkDim, textAlign: "center", marginTop: spacing(2), fontSize: 15, fontWeight: "600" },
  cardTitle: { color: colors.inkDim, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: spacing(2) },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing(1.5) },
  rowLabel: { color: colors.ink, flex: 1, fontWeight: "600" },
  rowValue: { color: colors.ink, fontWeight: "900", width: 90, textAlign: "right", fontVariant: ["tabular-nums"] },
  rowMeta: { color: colors.inkDim, width: 110, textAlign: "right", fontSize: 12 },
  ko: { color: colors.accent, fontWeight: "800", marginTop: spacing(2) },
});
