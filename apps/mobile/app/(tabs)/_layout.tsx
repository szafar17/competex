import React from "react";
import { Text } from "react-native";
import { Tabs } from "expo-router";
import { colors } from "@/lib/theme";

const ICONS: Record<string, string> = {
  me: "👤",
  train: "🏋️",
  battle: "🥊",
  feed: "📣",
  ranks: "🏆",
};

export default function TabsLayout(): React.JSX.Element {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkDim,
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>{ICONS[route.name] ?? "•"}</Text>
        ),
      })}
    >
      <Tabs.Screen name="me" options={{ title: "Me" }} />
      <Tabs.Screen name="train" options={{ title: "Train" }} />
      <Tabs.Screen name="battle" options={{ title: "Battle" }} />
      <Tabs.Screen name="feed" options={{ title: "Feed" }} />
      <Tabs.Screen name="ranks" options={{ title: "Ranks" }} />
    </Tabs>
  );
}
