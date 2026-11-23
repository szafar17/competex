import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Post } from "@cx/shared";
import { api } from "@/lib/api";
import { colors, spacing } from "@/lib/theme";
import { H1, Screen } from "@/components/ui";

const EMOJI: Record<string, string> = { fire: "🔥", flex: "💪", respect: "🙏", laugh: "😂" };

export default function FeedTab(): React.JSX.Element {
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ posts: Post[] }>("GET", "/v1/feed");
    setPosts(res.posts);
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  async function publish(): Promise<void> {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api("POST", "/v1/feed", { kind: "text", body: draft.trim() });
      setDraft("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function react(post: Post, emoji: string): Promise<void> {
    await api("POST", `/v1/feed/${post.id}/react`, { emoji });
    await load();
  }

  return (
    <Screen>
      <H1>Feed</H1>
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Talk your training…"
          placeholderTextColor={colors.inkDim}
          multiline
        />
        <Pressable style={[styles.post, busy && { opacity: 0.5 }]} onPress={() => void publish()} disabled={busy}>
          <Text style={styles.postText}>Post</Text>
        </Pressable>
      </View>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: spacing(8) }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.author}>@{item.authorHandle ?? "fighter"}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <View style={styles.reactions}>
              {Object.keys(EMOJI).map((e) => (
                <Pressable key={e} style={styles.reaction} onPress={() => void react(item, e)}>
                  <Text style={styles.reactionText}>
                    {EMOJI[e]} {item.reactions[e] ?? 0}
                  </Text>
                </Pressable>
              ))}
              <Text style={styles.comments}>💬 {item.commentCount}</Text>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  composer: { flexDirection: "row", gap: spacing(2), marginVertical: spacing(4), alignItems: "flex-end" },
  input: {
    flex: 1,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: spacing(3),
    minHeight: 48,
    maxHeight: 110,
  },
  post: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: spacing(4), paddingVertical: spacing(3) },
  postText: { color: "#fff", fontWeight: "800" },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: spacing(3.5),
    marginBottom: spacing(2.5),
  },
  author: { color: colors.accentSoft, fontWeight: "800", fontSize: 13 },
  body: { color: colors.ink, marginTop: spacing(1.5), fontSize: 15, lineHeight: 21 },
  reactions: { flexDirection: "row", gap: spacing(2), marginTop: spacing(2.5), alignItems: "center" },
  reaction: { backgroundColor: colors.surfaceRaised, borderRadius: 999, paddingHorizontal: spacing(2.5), paddingVertical: 4 },
  reactionText: { color: colors.ink, fontSize: 12 },
  comments: { color: colors.inkDim, fontSize: 12, marginLeft: "auto" },
});
