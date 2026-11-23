import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-store";
import { colors, spacing } from "@/lib/theme";
import { AvatarView } from "@/components/AvatarView";
import { Button, H1, Screen, Sub } from "@/components/ui";

export default function WelcomeScreen(): React.JSX.Element {
  const me = useAuth((s) => s.me);

  return (
    <Screen style={{ justifyContent: "center", alignItems: "center" }}>
      <View style={styles.face}>
        <AvatarView svg={me?.avatarSvg} seed={me?.user.handle ?? "fighter"} variant={me?.user.avatarVariant} size={140} />
      </View>
      <H1>Welcome, {me?.user.displayName ?? me?.user.handle ?? "fighter"}</H1>
      <Sub>Every run, lift and round of sparring now feeds your six stats. Train hard — then put your numbers in the ring.</Sub>
      <Text style={styles.hint}>Log a workout in Train to wake your stats up.</Text>
      <View style={{ alignSelf: "stretch" }}>
        <Button title="Enter CompeteX" onPress={() => router.replace("/(tabs)/me")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  face: { backgroundColor: "#f4f1ea", borderRadius: 18, overflow: "hidden", marginBottom: spacing(5) },
  hint: { color: colors.accentSoft, marginTop: spacing(4), fontWeight: "600" },
});
