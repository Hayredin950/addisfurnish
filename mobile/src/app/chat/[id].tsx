import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { fetchMessages, sendMessage } from "../../lib/api";
import { colors, radius, spacing } from "../../lib/theme";
import { timeAgo } from "../../lib/format";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLang();
  const [body, setBody] = useState("");
  const listRef = useRef<FlatList>(null);

  const messages = useAsync(() => fetchMessages(id ?? ""), [id]);
  const all = useMemo(() => messages.data ?? [], [messages.data]);

  // Realtime delivery for this conversation.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        () => messages.refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (all.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [all.length]);

  const send = async () => {
    const text = body.trim();
    if (!text || !id || !user) return;
    setBody("");
    try {
      await sendMessage(id, user.id, text);
      messages.refetch();
    } catch {
      setBody(text);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        ref={listRef}
        data={all}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const mine = item.sender_id === user?.id;
          return (
            <View style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap]}>
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.bubbleText, mine && { color: colors.onPrimary }]}>
                  {item.body}
                </Text>
              </View>
              <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
            </View>
          );
        }}
      />
      <View style={styles.inputBar}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t("description")}
          placeholderTextColor={colors.textSoft}
          style={styles.input}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, !body.trim() && { opacity: 0.4 }]}
          onPress={send}
          disabled={!body.trim()}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bubbleWrap: { marginBottom: 12, maxWidth: "80%" },
  mineWrap: { alignSelf: "flex-end", alignItems: "flex-end" },
  theirsWrap: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { backgroundColor: colors.primary },
  theirs: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  time: { fontSize: 10, color: colors.textSoft, marginTop: 4, marginHorizontal: 4 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    maxHeight: 110,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
