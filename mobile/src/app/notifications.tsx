import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
import { Button } from "../components/Button";
import { SheetOverlay } from "../components/SheetOverlay";
import { colors, radius, spacing } from "../lib/theme";
import { formatBirr, timeAgo } from "../lib/format";

type Notif = {
  id: string;
  type: string;
  payload: {
    title?: string;
    listingId?: string;
    offerId?: string;
    conversationId?: string;
    query?: string | null;
    status?: string;
    newPrice?: number;
    reason?: string;
    rating?: number;
    shopSlug?: string;
    buyerId?: string;
    buyerName?: string;
    buyerPhone?: string;
    senderName?: string;
    messagePreview?: string;
    message?: string;
    note?: string;
    phone?: string;
    amount?: number;
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
  const [detail, setDetail] = useState<Notif | null>(null);

  // Single-line label for the list: "Title — body" (or just one of them).
  const labelFor = (n: Notif): string => {
    const { title, body } = notificationText(lang, n.type, n.payload);
    return [title, body].filter(Boolean).join(" — ");
  };

  /** Label/value rows for the detail sheet, driven by the payload. */
  const detailRows = (n: Notif): { label: string; value: string }[] => {
    const p = n.payload ?? {};
    const from = p.buyerName || p.senderName || "";
    const rows: { label: string; value: string }[] = [];
    if (from) rows.push({ label: t("notifFrom"), value: from });
    if (p.amount != null) rows.push({ label: t("notifAmount"), value: formatBirr(Number(p.amount)) });
    if (p.phone) rows.push({ label: t("notifPhone"), value: p.phone });
    if (p.buyerPhone) rows.push({ label: t("notifPhone"), value: p.buyerPhone });
    if (p.message) rows.push({ label: t("notifMessage"), value: p.message });
    if (p.note) rows.push({ label: t("notifNote"), value: p.note });
    if (p.messagePreview) rows.push({ label: t("notifMessage"), value: p.messagePreview });
    if (p.status) rows.push({ label: t("notifStatus"), value: p.status });
    if (n.type === "shop_reviewed") {
      if (p.rating != null) rows.push({ label: t("notifRating"), value: `${p.rating}/5` });
      if (p.title) rows.push({ label: t("notifReview"), value: p.title });
    }
    return rows;
  };

  /** Primary action for the detail sheet (same targets as row taps). */
  const openDetailTarget = (n: Notif) => {
    const isConv =
      (n.type === "new_message" || n.type === "offer_received" || n.type === "offer_response") &&
      !!n.payload?.conversationId;
    // Seller-side offer alert: land on the dashboard's exact offer row.
    if (n.type === "offer_received" && n.payload?.offerId) {
      return {
        label: t("notifOpenDashboard"),
        go: () => router.push({ pathname: "/dashboard", params: { offer: n.payload!.offerId } }),
      };
    }
    if (isConv) {
      return { label: t("notifOpenConversation"), go: () => router.push(`/chat/${n.payload!.conversationId}`) };
    }
    if (n.type === "offer_received") {
      return { label: t("notifOpenDashboard"), go: () => router.push("/dashboard") };
    }
    if (n.type === "shop_reviewed" && (n.payload as { shopSlug?: string } | null)?.shopSlug) {
      return {
        label: t("notifOpenShop"),
        go: () => router.push(`/shop/${(n.payload as { shopSlug: string }).shopSlug}`),
      };
    }
    if (n.payload?.listingId) {
      return { label: t("notifOpenListing"), go: () => router.push(`/listing/${n.payload!.listingId}`) };
    }
    return null;
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
    // Seller-side offer alert lands on the dashboard's exact offer row
    // (?offer=<id>); older offers without an id fall back to the chat thread
    // (offers are mirrored into the conversation), then the plain dashboard.
    // Everything else with a listing link opens the listing.
    const isConv =
      (n.type === "new_message" || n.type === "offer_received" || n.type === "offer_response") &&
      !!n.payload?.conversationId;
    if (n.type === "offer_received" && n.payload?.offerId) {
      router.push({ pathname: "/dashboard", params: { offer: n.payload.offerId } });
    } else if (isConv) {
      router.push(`/chat/${n.payload!.conversationId}`);
    } else if (n.type === "offer_received") {
      router.push("/dashboard");
    } else if (n.type === "shop_reviewed" && (n.payload as { shopSlug?: string } | null)?.shopSlug) {
      router.push(`/shop/${(n.payload as { shopSlug: string }).shopSlug}`);
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
                  : item.type === "offer_received" || item.type === "offer_response"
                    ? "pricetag"
                    : item.type === "listing_sold"
                    ? "checkmark-circle"
                    : item.type === "price_drop"
                      ? "trending-down"
                    : item.type === "saved_search_match"
                      ? "search"
                      : item.type === "shop_reviewed"
                        ? "star"
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
                  onPress={() => {
                    setDetail(item);
                    void markNotificationRead(item.id);
                    refetch();
                  }}
                >
                  <Ionicons name="eye" size={16} color={colors.primary} />
                </Pressable>
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

      {/* Details — who, when, and every payload field for the tapped alert. */}
      <Modal
        visible={detail !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <SheetOverlay onClose={() => setDetail(null)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {detail ? labelFor(detail) : t("notifShowDetails")}
              </Text>
              <Pressable onPress={() => setDetail(null)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            {detail ? (
              <ScrollView style={{ maxHeight: 380 }}>
                <Text style={styles.modalWhen}>
                  {new Date(detail.created_at).toLocaleDateString()} ·{" "}
                  {new Date(detail.created_at).toLocaleTimeString()}
                </Text>
                {detailRows(detail).map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={styles.detailValue}>{row.value}</Text>
                  </View>
                ))}
                {openDetailTarget(detail) ? (
                  <View style={{ marginTop: spacing.md }}>
                    <Button
                      title={openDetailTarget(detail)!.label}
                      onPress={() => {
                        const target = openDetailTarget(detail)!;
                        setDetail(null);
                        target.go();
                      }}
                    />
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </SheetOverlay>
      </Modal>
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
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalWhen: { fontSize: 12, color: colors.textSoft, marginBottom: spacing.md },
  detailRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: { width: 110, fontSize: 13, color: colors.textSoft },
  detailValue: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 19 },
});
