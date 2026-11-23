import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors, STAT_LABELS } from "../lib/theme";

interface Props {
  statKey: string;
  value: number;
}

export function StatGauge({ statKey, value }: Props): React.JSX.Element {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withSpring(value, { damping: 16, stiffness: 90 });
  }, [value, width]);

  const fill = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{STAT_LABELS[statKey] ?? statKey.toUpperCase()}</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fill]} />
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginVertical: 5 },
  label: { color: colors.inkDim, width: 42, fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  value: { color: colors.ink, width: 34, textAlign: "right", fontVariant: ["tabular-nums"], fontWeight: "700" },
});
