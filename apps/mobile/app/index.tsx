/** Splash / route decision: wait for boot, then send the user where they belong. */

import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth-store";
import { colors } from "@/lib/theme";

export default function Index(): React.JSX.Element {
  const status = useAuth((s) => s.status);
  const me = useAuth((s) => s.me);

  if (status === "booting") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <Text style={{ color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: 2 }}>COMPETE✕</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (status === "signed_out") return <Redirect href="/onboarding/phone" />;
  // Signed in but unfinished onboarding → resume at the handle step.
  if (!me?.user.handle) return <Redirect href="/onboarding/handle" />;
  return <Redirect href="/(tabs)/me" />;
}
