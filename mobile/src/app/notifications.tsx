import { useEffect } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { useAsync } from "../hooks/use-async";
import {
  deleteNotification,
  fetchNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "../lib/api";
import { subscribeNotifications, notificationText } from "../lib/notifications";
import { EmptyState } from "../components/EmptyState";
import { colors, radius, spacing } from "../lib/theme";
import { timeAgo } from "../lib/format";

type Notif = {
  id: string;
  type: string;
  payload: {
    title?: string;
    listingId?: string;
    conversationId?: string;
    query?: string | null;
    status?: string;
    newPrice?: number;
    reason?: string;
  } | null;
  is_read: boolean;
  created_at: string;
};

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { lang, t } = useLang();

  const { data, loading, error, refetch } = useAsync(
    () => fetchNotifications(user?.id ?? ""),
    [user?.id],
    !!user,
  );

  const notifs = (data ?? []) as unknown as Notif[];

  // Single-line label for the list: "Title — body" (or just one of them).
  const labelFor = (n: Notif): string => {
    const { title, body } = notificationText(lang, n.type, n.payload);
    return [title, body].filter(Boolean).join(" — ");
  };

  const markAllRead = async () => {
    if (!user) return;
    try {
      await markNotificationsRead(user.id);
      refetch();
    } catch {
      // Non-critical: the unread badge just persists until the next open.
    }
  };

  const dismiss = async (id: string) => {
    try {
      await deleteNotification(id);
      refetch();
    } catch {
      // Non-critical: the row stays put.
    }
  };

  const unread = notifs.filter((n) => !n.is_read).length;

  // Live delivery: refetch when a realtime INSERT arrives (the foreground
  // banner is shown app-wide by the root layout — no duplicate here).
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeNotifications(user.id, () => {
      refetch();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openNotif = (n: Notif) => {
    void markNotificationRead(n.id);
    // Message notifications go straight to the conversation; everything else
    // with a listing link opens the listing. (Web parity: /messages?conv=id.)
    if (n.type === "new_message" && n.payload?.conversationId) {
      router.push(`/chat/${n.payload.conversationId}`);
    } else if (n.payload?.listingId) {
      router.push(`/listing/${n.payload.listingId}`);
    } else {
      refetch();
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header with mark-all-read */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("notifications")}</Text>
        {unread > 0 ? (
          <Pressable style={styles.markAllBtn} onPress={markAllRead} hitSlop={8}>
            <Ionicons name="checkmark-done" size={15} color={colors.primary} />
            <Text style={styles.markAllText}>{t("notifMarkAll")}</Text>
          </Pressable>
        ) : null}
      </View>
      {loading && !data ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : notifs.length === 0 ? (
        <EmptyState
          title={error ? t("noConnection") : t("emptyNotifications")}
          hint={error ? t("retry") : undefined}
        />
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          renderItem={({ item }) => {
            const icon =
              item.type === "new_message"
                ? "chatbubble"
                : item.type === "callback_request" || item.type === "callback_response"
                  ? "call"
                  : item.type === "listing_sold"
                    ? "checkmark-circle"
                    : item.type === "price_drop"
                      ? "trending-down"
                      : item.type === "saved_search_match"
                        ? "search"
                        : item.type === "seller_verified"
                          ? "shield-checkmark"
                          : "notifications";
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.cardPressed },
                  !item.is_read && styles.unread,
                ]}
                onPress={() => openNotif(item)}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name={icon} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.body, !item.is_read && { fontWeight: "700" }]}>
                    {labelFor(item)}
                  </Text>
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.is_read ? <View style={styles.dot} /> : null}
                <Pressable
                  hitSlop={8}
                  style={styles.dismissBtn}
                  onPress={() => dismiss(item.id)}
                >
                  <Ionicons name="close" size={15} color={colors.textSoft} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.text, fontFamily: "Georgia, serif" },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  markAllText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
  },
  unread: { borderWidth: 1, borderColor: colors.primary },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { fontSize: 14, color: colors.text, lineHeight: 19 },
  time: { fontSize: 11, color: colors.textSoft, marginTop: 3 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  dismissBtn: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
});
