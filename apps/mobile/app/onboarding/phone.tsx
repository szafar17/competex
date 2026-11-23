import React, { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-store";
import { colors, spacing } from "@/lib/theme";
import { Button, Card, H1, Screen, Sub } from "@/components/ui";

export default function PhoneScreen(): React.JSX.Element {
  const signIn = useAuth((s) => s.signIn);
  const [phone, setPhone] = useState("+1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await signIn(phone);
      const me = useAuth.getState().me;
      // Returning users with a handle skip straight to the app.
      router.replace(me?.user.handle ? "/(tabs)/me" : "/onboarding/handle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ justifyContent: "center" }}>
      <H1>Step into the ring</H1>
      <Sub>Your training is your power-up. Your phone number is your corner — enter it and you're in.</Sub>
      <Card>
        <Text style={styles.label}>PHONE</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoFocus
          placeholder="+15551234567"
          placeholderTextColor={colors.inkDim}
        />
        <Button title={busy ? "Signing in…" : "Sign in"} onPress={() => void go()} disabled={busy || phone.length < 8} />
        {error && <Text style={styles.error}>{error}</Text>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.inkDim, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: spacing(2) },
  input: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "700",
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
  },
  error: { color: colors.red, marginTop: spacing(3) },
});
