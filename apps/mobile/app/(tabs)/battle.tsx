import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { BattleFind, MatchKind } from "@cx/shared";
import { api } from "@/lib/api";
import { useBattle } from "@/lib/battle-store";
import { colors, spacing } from "@/lib/theme";
import { Button, Card, H1, Screen, Sub } from "@/components/ui";

interface RecentMatch {
  id: string;
  kind: MatchKind;
  opponentHandle: string;
  result: "win" | "loss" | "draw" | "pending";
  eloDelta: number | null;
  playedAt: string;
}

const RESULT_COLOR: Record<RecentMatch["result"], string> = {
  win: colors.green,
  loss: colors.red,
  draw: colors.gold,
  pending: colors.inkDim,
};

export default function BattleTab(): React.JSX.Element {
  const stage = useBattle((s) => s.stage);
  const [busy, setBusy] = useState<MatchKind | null>(null);
  const [recent, setRecent] = useState<RecentMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ matches: RecentMatch[] }>("GET", "/v1/battle/recent")
      .then((r) => setRecent(r.matches))
      .catch(() => undefined);
  }, []);

  async function find(kind: MatchKind): Promise<void> {
    setBusy(kind);
    setError(null);
    try {
      const found = await api<BattleFind>("POST", "/v1/battle/find", { kind });
      stage(found);
      router.push("/battle/prefight");
    } catch (e) {
      setError(e instanceof Error ? e.message : "matchmaking failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: spacing(5) }}>
        <H1>Battle</H1>
        <Sub>Your stats walk into the ring. You call the shots at 60Hz; the server checks the tape.</Sub>

        <Card>
          <Text style={styles.kindTitle}>🤖 PRACTICE</Text>
          <Sub>Spar the CPU bot. No ELO on the line.</Sub>
          <Button title={busy === "practice" ? "Finding…" : "Spar the bot"} onPress={() => void find("practice")} disabled={busy !== null} />
        </Card>

        <Card>
          <Text style={styles.kindTitle}>⚡ QUICK MATCH</Text>
          <Sub>±250 ELO matchmaking. Rated, K=24.</Sub>
          <Button title={busy === "quick" ? "Finding…" : "Find a fight"} onPress={() => void find("quick")} disabled={busy !== null} />
        </Card>

        <Card>
          <Text style={styles.kindTitle}>🏆 RANKED</Text>
          <Sub>Same band, higher stakes pride-wise. Climb the ladder.</Sub>
          <Button title={busy === "ranked" ? "Finding…" : "Go ranked"} onPress={() => void find("ranked")} disabled={busy !== null} />
        </Card>

        {error && <Text style={styles.error}>{error}</Text>}

        <Card>
          <Text style={styles.kindTitle}>RECENT FIGHTS</Text>
          {recent.length === 0 && <Sub>No tape yet. Go make some.</Sub>}
          {recent.map((m) => (
            <View key={m.id} style={styles.row}>
              <Text style={[styles.result, { color: RESULT_COLOR[m.result] }]}>{m.result.toUpperCase()}</Text>
              <Text style={styles.opponent}>vs @{m.opponentHandle}</Text>
              <Text style={styles.meta}>
                {m.kind}
                {m.eloDelta != null && m.eloDelta !== 0 ? ` · ${m.eloDelta > 0 ? "+" : ""}${m.eloDelta}` : ""}
              </Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kindTitle: { color: colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  error: { color: colors.red, marginTop: spacing(3) },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing(2) },
  result: { width: 70, fontWeight: "900", fontSize: 12, letterSpacing: 0.5 },
  opponent: { color: colors.ink, fontWeight: "700", flex: 1 },
  meta: { color: colors.inkDim, fontSize: 12 },
});
