import React, { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { colors, spacing } from "@/lib/theme";
import { Button, Card, H1, Screen, Sub } from "@/components/ui";

export default function HandleScreen(): React.JSX.Element {
  const refreshMe = useAuth((s) => s.refreshMe);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^[a-z0-9_]{3,20}$/.test(handle);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api("PATCH", "/v1/me", { handle, displayName: displayName || handle });
      await refreshMe();
      router.push("/onboarding/disciplines");
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save handle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ justifyContent: "center" }}>
      <H1>Pick your fight name</H1>
      <Sub>Lowercase letters, digits, underscores. This is what opponents see across the ring.</Sub>
      <Card>
        <Text style={styles.label}>HANDLE</Text>
        <TextInput
          style={styles.input}
          value={handle}
          onChangeText={(t) => setHandle(t.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          placeholder="iron_mike"
          placeholderTextColor={colors.inkDim}
        />
        <Text style={[styles.label, { marginTop: spacing(4) }]}>DISPLAY NAME (OPTIONAL)</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Iron Mike"
          placeholderTextColor={colors.inkDim}
        />
        <Button title={busy ? "Saving…" : "Continue"} onPress={() => void save()} disabled={busy || !valid} />
        {error && <Text style={styles.error}>{error}</Text>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.inkDim, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: spacing(2) },
  input: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
  },
  error: { color: colors.red, marginTop: spacing(3) },
});
