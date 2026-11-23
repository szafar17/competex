import React, { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { STAT_KEYS, DISCIPLINE_LABELS } from "@cx/shared";
import { useAuth } from "@/lib/auth-store";
import { colors, spacing } from "@/lib/theme";
import { AvatarView } from "@/components/AvatarView";
import { StatGauge } from "@/components/StatGauge";
import { Button, Card, Screen } from "@/components/ui";

export default function MeTab(): React.JSX.Element {
  const me = useAuth((s) => s.me);
  const refreshMe = useAuth((s) => s.refreshMe);
  const signOut = useAuth((s) => s.signOut);
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshMe().catch(() => undefined);
    setRefreshing(false);
  }, [refreshMe]);

  if (!me) return <Screen />;

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.face}>
            <AvatarView svg={me.avatarSvg} seed={me.user.handle ?? "fighter"} variant={me.user.avatarVariant} size={84} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing(4) }}>
            <Text style={styles.name}>{me.user.displayName ?? me.user.handle}</Text>
            <Text style={styles.handle}>@{me.user.handle}</Text>
            <Text style={styles.disciplines}>
              {me.user.disciplines.map((d) => DISCIPLINE_LABELS[d]).join(" · ")}
            </Text>
          </View>
        </View>

        <View style={styles.badges}>
          <Badge label="ELO" value={String(me.rating.rating)} />
          <Badge label="RECORD" value={`${me.rating.wins}-${me.rating.losses}-${me.rating.draws}`} />
          <Badge label="STREAK" value={`${me.streak.current}🔥`} />
        </View>

        <Card>
          <Text style={styles.cardTitle}>SIX-STAT VECTOR · 28-DAY WINDOW</Text>
          {STAT_KEYS.map((k) => (
            <StatGauge key={k} statKey={k} value={me.stats[k]} />
          ))}
        </Card>

        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </ScrollView>
    </Screen>
  );
}

function Badge({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeValue}>{value}</Text>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center" },
  face: { backgroundColor: "#f4f1ea", borderRadius: 14, overflow: "hidden" },
  name: { color: colors.ink, fontSize: 24, fontWeight: "900" },
  handle: { color: colors.inkDim, fontSize: 14, marginTop: 2 },
  disciplines: { color: colors.accentSoft, fontSize: 13, fontWeight: "700", marginTop: spacing(1.5) },
  badges: { flexDirection: "row", gap: spacing(2.5), marginTop: spacing(4) },
  badge: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: spacing(3),
  },
  badgeValue: { color: colors.ink, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  badgeLabel: { color: colors.inkDim, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
  cardTitle: { color: colors.inkDim, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: spacing(2) },
});
