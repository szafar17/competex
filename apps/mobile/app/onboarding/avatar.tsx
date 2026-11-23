import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AVATAR_VARIANTS, type AvatarVariant } from "@cx/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { colors, spacing } from "@/lib/theme";
import { AvatarView } from "@/components/AvatarView";
import { Button, H1, Screen, Sub } from "@/components/ui";

const LABELS: Record<AvatarVariant, string> = {
  inkline: "Inkline",
  soft: "Soft",
  editorial: "Editorial",
  brush: "Brush",
};

export default function AvatarScreen(): React.JSX.Element {
  const me = useAuth((s) => s.me);
  const refreshMe = useAuth((s) => s.refreshMe);
  const [variant, setVariant] = useState<AvatarVariant>("inkline");
  const [busy, setBusy] = useState(false);
  const seed = me?.user.handle ?? "fighter";

  async function save(): Promise<void> {
    setBusy(true);
    try {
      await api("PATCH", "/v1/me", { avatarVariant: variant });
      await refreshMe();
      router.push("/onboarding/welcome");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ justifyContent: "center" }}>
      <H1>Your face, four ways</H1>
      <Sub>The avatar engine draws you from your handle. Pick the tone that feels like fight night.</Sub>
      <View style={styles.grid}>
        {AVATAR_VARIANTS.map((v) => {
          const on = v === variant;
          return (
            <Pressable key={v} onPress={() => setVariant(v)} style={[styles.cell, on && styles.cellOn]}>
              <View style={styles.face}>
                <AvatarView seed={seed} variant={v} size={104} />
              </View>
              <Text style={[styles.cellLabel, on && { color: colors.accent }]}>{LABELS[v]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Button title={busy ? "Inking…" : "Lock it in"} onPress={() => void save()} disabled={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3), marginTop: spacing(5), marginBottom: spacing(2) },
  cell: {
    width: "47%",
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    paddingVertical: spacing(3),
  },
  cellOn: { borderColor: colors.accent },
  face: { backgroundColor: "#f4f1ea", borderRadius: 10, overflow: "hidden" },
  cellLabel: { color: colors.inkDim, fontWeight: "800", marginTop: spacing(2) },
});
