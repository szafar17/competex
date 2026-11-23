import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { DISCIPLINE_LABELS, DISCIPLINES, type Discipline } from "@cx/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { colors, spacing } from "@/lib/theme";
import { Button, H1, Screen, Sub } from "@/components/ui";

export default function DisciplinesScreen(): React.JSX.Element {
  const refreshMe = useAuth((s) => s.refreshMe);
  const [picked, setPicked] = useState<Discipline[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle(d: Discipline): void {
    setPicked((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : cur.length < 3 ? [...cur, d] : cur));
  }

  async function save(): Promise<void> {
    setBusy(true);
    try {
      await api("PATCH", "/v1/me", { disciplines: picked });
      await refreshMe();
      router.push("/onboarding/avatar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ justifyContent: "center" }}>
      <H1>Choose your style</H1>
      <Sub>Pick 1–3 disciplines. They shape your in-ring moveset — your jab might be a teep.</Sub>
      <View style={styles.grid}>
        {DISCIPLINES.map((d) => {
          const on = picked.includes(d);
          return (
            <Pressable key={d} onPress={() => toggle(d)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && { color: "#fff" }]}>{DISCIPLINE_LABELS[d]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Button title={busy ? "Saving…" : `Continue (${picked.length}/3)`} onPress={() => void save()} disabled={busy || picked.length === 0} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2.5), marginTop: spacing(5), marginBottom: spacing(2) },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing(4.5),
    paddingVertical: spacing(3),
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.ink, fontWeight: "800", fontSize: 15 },
});
