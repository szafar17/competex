import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { WORKOUT_KINDS, type StatVector, type WorkoutKind } from "@cx/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { colors, spacing } from "@/lib/theme";
import { Button, Card, H1, Screen, Sub } from "@/components/ui";

interface WorkoutRow {
  id: string;
  kind: WorkoutKind;
  startedAt: string;
  durationMin: number;
  intensity: number;
}

const KIND_EMOJI: Record<WorkoutKind, string> = {
  run: "🏃",
  strength: "🏋️",
  hiit: "⚡",
  sparring: "🥊",
  drills: "🎯",
  mobility: "🧘",
  swim: "🏊",
  cycle: "🚴",
};

export default function TrainTab(): React.JSX.Element {
  const refreshMe = useAuth((s) => s.refreshMe);
  const [kind, setKind] = useState<WorkoutKind>("sparring");
  const [duration, setDuration] = useState(45);
  const [intensity, setIntensity] = useState(7);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<WorkoutRow[]>([]);
  const [lastStats, setLastStats] = useState<StatVector | null>(null);

  async function load(): Promise<void> {
    const res = await api<{ workouts: WorkoutRow[] }>("GET", "/v1/workouts");
    setRecent(res.workouts.slice(0, 10));
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  async function log(): Promise<void> {
    setBusy(true);
    try {
      const res = await api<{ stats: StatVector; streak: { current: number } }>("POST", "/v1/workouts", {
        kind,
        startedAt: new Date(Date.now() - duration * 60_000).toISOString(),
        durationMin: duration,
        intensity,
      });
      setLastStats(res.stats);
      await Promise.all([load(), refreshMe()]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: spacing(5) }}>
        <H1>Train</H1>
        <Sub>Every session feeds the vector. Heavier and longer hits harder.</Sub>

        <Card>
          <Text style={styles.label}>SESSION TYPE</Text>
          <View style={styles.kinds}>
            {WORKOUT_KINDS.map((k) => (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.kind, kind === k && styles.kindOn]}>
                <Text style={styles.kindEmoji}>{KIND_EMOJI[k]}</Text>
                <Text style={[styles.kindText, kind === k && { color: "#fff" }]}>{k}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: spacing(4) }]}>DURATION · {duration} MIN</Text>
          <Stepper value={duration} onChange={setDuration} step={15} min={15} max={180} />

          <Text style={[styles.label, { marginTop: spacing(4) }]}>INTENSITY · {intensity}/10</Text>
          <Stepper value={intensity} onChange={setIntensity} step={1} min={1} max={10} />

          <Button title={busy ? "Logging…" : "Log session"} onPress={() => void log()} disabled={busy} />
          {lastStats && <Text style={styles.gain}>Stats updated — check your gauges in Me.</Text>}
        </Card>

        <Card>
          <Text style={styles.label}>RECENT SESSIONS</Text>
          {recent.length === 0 && <Sub>Nothing yet. First session starts the streak.</Sub>}
          {recent.map((w) => (
            <View key={w.id} style={styles.row}>
              <Text style={styles.rowEmoji}>{KIND_EMOJI[w.kind]}</Text>
              <Text style={styles.rowKind}>{w.kind}</Text>
              <Text style={styles.rowMeta}>
                {w.durationMin}m · int {w.intensity} · {new Date(w.startedAt).toLocaleDateString()}
              </Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Stepper({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}): React.JSX.Element {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - step))}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <View style={styles.stepTrack}>
        <View style={[styles.stepFill, { width: `${((value - min) / (max - min)) * 100}%` }]} />
      </View>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + step))}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.inkDim, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: spacing(2) },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  kind: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    backgroundColor: colors.surfaceRaised,
  },
  kindOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  kindEmoji: { fontSize: 14 },
  kindText: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  stepTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  stepFill: { height: 8, backgroundColor: colors.accent },
  gain: { color: colors.green, marginTop: spacing(3), fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing(2) },
  rowEmoji: { fontSize: 16, width: 28 },
  rowKind: { color: colors.ink, fontWeight: "800", width: 84, textTransform: "capitalize" },
  rowMeta: { color: colors.inkDim, fontSize: 12, flex: 1 },
});
