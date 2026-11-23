/** Tale of the tape — reads the staged matchup from the battle store. */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { DISCIPLINE_LABELS, STAT_KEYS, type FighterCard } from "@cx/shared";
import { useBattle } from "@/lib/battle-store";
import { colors, spacing } from "@/lib/theme";
import { AvatarView } from "@/components/AvatarView";
import { Button, Screen } from "@/components/ui";

export default function PrefightScreen(): React.JSX.Element {
  const find = useBattle((s) => s.find);

  if (!find) {
    return (
      <Screen style={{ justifyContent: "center" }}>
        <Text style={styles.vs}>No fight staged</Text>
        <Button title="Back to Battle" onPress={() => router.replace("/(tabs)/battle")} />
      </Screen>
    );
  }

  return (
    <Screen style={{ justifyContent: "center" }}>
      <Text style={styles.kind}>{find.kind.toUpperCase()} · 3 ROUNDS</Text>
      <View style={styles.tape}>
        <CornerCol card={find.you} align="left" />
        <Text style={styles.vs}>VS</Text>
        <CornerCol card={find.opponent} align="right" />
      </View>

      <View style={styles.stats}>
        {STAT_KEYS.map((k) => (
          <View key={k} style={styles.statRow}>
            <Text style={[styles.statVal, find.you.stats[k] >= find.opponent.stats[k] && styles.statWin]}>
              {find.you.stats[k]}
            </Text>
            <Text style={styles.statKey}>{k.toUpperCase()}</Text>
            <Text style={[styles.statVal, find.opponent.stats[k] >= find.you.stats[k] && styles.statWin]}>
              {find.opponent.stats[k]}
            </Text>
          </View>
        ))}
      </View>

      <Button title="Touch gloves → fight" onPress={() => router.replace("/battle/match")} />
      <Button title="Walk away" variant="ghost" onPress={() => router.replace("/(tabs)/battle")} />
    </Screen>
  );
}

function CornerCol({ card, align }: { card: FighterCard; align: "left" | "right" }): React.JSX.Element {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <View style={styles.face}>
        <AvatarView seed={card.handle} variant={card.avatarVariant} size={88} />
      </View>
      <Text style={styles.handle} numberOfLines={1}>
        @{card.handle}
      </Text>
      <Text style={styles.rating}>{card.rating} ELO</Text>
      <Text style={styles.disciplines} numberOfLines={2}>
        {card.disciplines.map((d) => DISCIPLINE_LABELS[d]).join(" · ")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kind: { color: colors.accentSoft, textAlign: "center", fontWeight: "900", letterSpacing: 2, marginBottom: spacing(5) },
  tape: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  vs: { color: colors.accent, fontSize: 26, fontWeight: "900", textAlign: "center" },
  face: { backgroundColor: "#f4f1ea", borderRadius: 14, overflow: "hidden" },
  handle: { color: colors.ink, fontWeight: "900", marginTop: spacing(2), fontSize: 15 },
  rating: { color: colors.gold, fontWeight: "800", fontSize: 12, marginTop: 2 },
  disciplines: { color: colors.inkDim, fontSize: 11, textAlign: "center", marginTop: spacing(1) },
  stats: { marginVertical: spacing(5) },
  statRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing(1.5) },
  statVal: { color: colors.inkDim, width: 60, textAlign: "center", fontWeight: "800", fontSize: 16, fontVariant: ["tabular-nums"] },
  statWin: { color: colors.ink },
  statKey: { color: colors.inkDim, flex: 1, textAlign: "center", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
});
