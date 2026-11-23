/** Small shared UI atoms — Inkline buttons, cards, headers. */

import React from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, spacing } from "../lib/theme";

export function Screen({ children, style }: { children?: React.ReactNode; style?: ViewStyle }): React.JSX.Element {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Text style={styles.h1}>{children}</Text>;
}

export function Sub({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Text style={styles.sub}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }): React.JSX.Element {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      <Text style={[styles.btnText, variant === "ghost" && { color: colors.ink }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing(5) },
  h1: { color: colors.ink, fontSize: 28, fontWeight: "800", letterSpacing: 0.3 },
  sub: { color: colors.inkDim, fontSize: 15, marginTop: spacing(1), lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing(4),
    marginTop: spacing(3),
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: spacing(3.5),
    alignItems: "center",
    marginTop: spacing(3),
  },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  btnDanger: { backgroundColor: colors.red },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.4 },
});
