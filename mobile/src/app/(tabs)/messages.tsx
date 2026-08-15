import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { deleteConversation, fetchConversations } from "../../lib/api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { colors, radius, spacing } from "../../lib/theme";
import { imageSource } from "../../lib/storage";
import { formatBirr, timeAgo } from "../../lib/format";

type Conv = {
  id: string;
  last_message_at: string;
  listings: { id: string; title: string; price: number; listing_images: { url: string }[] } | null;
  profiles: {
    id: string;
    full_name: string;
    shop_name: string | null;
    shop_logo_url: string | null;
  } | null;
  unread: number;
};

export default function MessagesScreen() {
  const { user } = useAuth();
  const { t } = useLang();
  const [pendingDelete, setPendingDelete] = useState<Conv | null>(null);

  const { data, loading, error, refetch } = useAsync(
    () => fetchConversations(user?.id ?? ""),
    [user?.id],
    !!user,
  );

  // Realtime: new message in any conversation refreshes the list.
  const refetchCb = useCallback(() => refetch(), [refetch]);
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`convos-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () =>
        refetchCb(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refetchCb]);

  const renderItem = ({ item }: { item: Conv }) => {
    const other = item.profiles;
    const title = other?.shop_name ?? other?.full_name ?? "";
    const sub = item.listings?.title ?? (item.listings ? formatBirr(item.listings.price) : "");
    const img = item.listings?.listing_images?.[0]?.url ?? other?.shop_logo_url ?? null;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: colors.cardPressed },
          item.unread > 0 && styles.unreadRow,
        ]}
        onPress={() => router.push(`/chat/${item.id}`)}
      >
        <View style={styles.avatar}>
          {img ? (
            <Image source={imageSource(img, undefined, 200)} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarEmoji}>🛋️</Text>
          )}
          {item.unread > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{item.unread > 99 ? "99+" : item.unread}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={[styles.name, item.unread > 0 && { fontWeight: "800" }]}
          >
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {sub}
          </Text>
        </View>
        <View style={styles.rightCol}>
          <Text style={styles.time}>{timeAgo(item.last_message_at)}</Text>
          <Pressable
            hitSlop={8}
            style={styles.trashBtn}
            onPress={() => setPendingDelete(item)}
          >
            <Ionicons name="trash-outline" size={16} color={colors.textSoft} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const runDelete = async () => {
    const conv = pendingDelete;
    setPendingDelete(null);
    if (!conv || !user) return;
    try {
      await deleteConversation(conv.id, user.id);
      refetch();
    } catch {
      // Non-critical: the row stays put on failure.
    }
  };

  return (
    <View style={styles.screen}>
      {loading && !data ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title={error ? t("noConnection") : t("emptyMessages")}
          hint={error ? t("retry") : t("emptyMessagesHint")}
        />
      ) : (
        <FlatList
          data={data as unknown as Conv[]}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg }}
          renderItem={renderItem}
          onRefresh={refetch}
          refreshing={loading && !!data}
        />
      )}
      <ConfirmDialog
        visible={!!pendingDelete}
        title={t("msgDeleteConversation")}
        message={t("msgDeleteConversationHint")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={runDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginBottom: 10,
  },
  unreadRow: { borderWidth: 1, borderColor: colors.primary },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: 48, height: 48, borderRadius: radius.full },
  avatarEmoji: { fontSize: 22 },
  unreadBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rightCol: { alignItems: "flex-end", gap: 6 },
  time: { fontSize: 11, color: colors.textSoft },
  trashBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
});
