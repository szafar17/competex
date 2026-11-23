import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { RankRow } from "@cx/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { colors, spacing } from "@/lib/theme";
import { H1, Screen, Sub } from "@/components/ui";

type Scope = "global" | "friends";

export default function RanksTab(): React.JSX.Element {
  const me = useAuth((s) => s.me);
  const [scope, setScope] = useState<Scope>("global");
  const [rows, setRows] = useState<RankRow[]>([]);
  const [myRow, setMyRow] = useState<RankRow | null>(null);

  const load = useCallback(async () => {
    const [ladder, mine] = await Promise.all([
      api<{ rows: RankRow[] }>("GET", `/v1/ranks/${scope}`),
      api<{ row: RankRow | null }>("GET", "/v1/ranks/me"),
    ]);
    setRows(ladder.rows);
    setMyRow(mine.row);
  }, [scope]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  return (
    <Screen>
      <H1>Ranks</H1>
      {myRow && (
        <Sub>
          You are #{myRow.rank} at {myRow.rating} ELO ({myRow.wins}W–{myRow.losses}L)
        </Sub>
      )}
      <View style={styles.toggle}>
        {(["global", "friends"] as const).map((s) => (
          <Pressable key={s} onPress={() => setScope(s)} style={[styles.toggleBtn, scope === s && styles.toggleOn]}>
            <Text style={[styles.toggleText, scope === s && { color: "#fff" }]}>{s.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.userId}
        renderItem={({ item }) => {
          const isMe = item.handle != null && item.handle === me?.user.handle;
          return (
            <View style={[styles.row, isMe && styles.rowMe]}>
              <Text style={styles.rank}>#{item.rank}</Text>
              <Text style={[styles.handle, isMe && { color: colors.accent }]}>@{item.handle ?? "fighter"}</Text>
              <Text style={styles.record}>
                {item.wins}W–{item.losses}L
              </Text>
              <Text style={styles.rating}>{item.rating}</Text>
            </View>
          );
        }}
        ListEmptyComponent={<Sub>Ladder is empty — go win something.</Sub>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", gap: spacing(2), marginVertical: spacing(4) },
  toggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: spacing(2.5),
    backgroundColor: colors.surface,
  },
  toggleOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleText: { color: colors.inkDim, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowMe: { backgroundColor: colors.surface, borderRadius: 10 },
  rank: { color: colors.inkDim, width: 44, fontWeight: "800", fontVariant: ["tabular-nums"] },
  handle: { color: colors.ink, flex: 1, fontWeight: "700" },
  record: { color: colors.inkDim, width: 70, textAlign: "right", fontSize: 12 },
  rating: { color: colors.gold, width: 60, textAlign: "right", fontWeight: "900", fontVariant: ["tabular-nums"] },
});
