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
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { fetchConversations } from "../../lib/api";
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
};

export default function MessagesScreen() {
  const { user } = useAuth();
  const { t } = useLang();

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
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cardPressed }]}
        onPress={() => router.push(`/chat/${item.id}`)}
      >
        <View style={styles.avatar}>
          {img ? (
            <Image source={imageSource(img)} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarEmoji}>🛋️</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.name}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {sub}
          </Text>
        </View>
        <Text style={styles.time}>{timeAgo(item.last_message_at)}</Text>
      </Pressable>
    );
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
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  time: { fontSize: 11, color: colors.textSoft },
});
