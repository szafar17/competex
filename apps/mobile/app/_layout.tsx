import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuth } from "@/lib/auth-store";
import { colors } from "@/lib/theme";

export default function RootLayout(): React.JSX.Element {
  const boot = useAuth((s) => s.boot);

  useEffect(() => {
    void boot();
  }, [boot]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "fade",
        }}
      />
    </GestureHandlerRootView>
  );
}
