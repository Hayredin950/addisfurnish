import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { useAsync } from "../hooks/use-async";
import {
  deleteListing,
  fetchCallbacks,
  fetchConversationCount,
  fetchMyListings,
  fetchOffersForSeller,
  fetchViewsPerDay,
  markListingSold,
  respondToOffer,
  updateCallbackStatus,
  updateListingStatus,
} from "../lib/api";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { EmptyState } from "../components/EmptyState";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { imageSource } from "../lib/storage";
import { formatBirr, timeAgo } from "../lib/format";

/**
 * Seller dashboard — a home for everything the profile page used to pile in:
 * the headline stats, listing management (status, edit, delete) and callback
 * requests. The profile tab now points here instead of rendering it all inline.
 */
export default function DashboardScreen() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    label: string;
    onConfirm: () => void;
  } | null>(null);

  const myListings = useAsync(() => fetchMyListings(user?.id ?? ""), [user?.id], !!user);
  const callbacks = useAsync(() => fetchCallbacks(user?.id ?? ""), [user?.id], !!user?.id);
  const offers = useAsync(() => fetchOffersForSeller(user?.id ?? ""), [user?.id], !!user?.id);
  const convCount = useAsync(() => fetchConversationCount(user?.id ?? ""), [user?.id], !!user?.id);
  const views = useAsync(() => fetchViewsPerDay(user?.id ?? ""), [user?.id], !!user?.id);

  if (!user) {
    return (
      <View style={styles.center}>
        <EmptyState title={t("notSignedIn")} hint={t("signInPrompt")} />
        <Button title={t("signIn")} onPress={() => router.push("/auth")} style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (!profile?.is_seller) {
    return (
      <View style={styles.center}>
        <EmptyState title={t("becomeSeller")} hint={t("becomeSellerHint")} />
        <Button
          title={t("createShop")}
          onPress={() => router.push("/sell")}
          style={{ marginTop: 16 }}
        />
      </View>
    );
  }

  const listings = myListings.data ?? [];
  const totalViews = listings.reduce((s, l) => s + (l.view_count ?? 0), 0);
  const viewsPerDay = views.data ?? [];
  const maxDay = Math.max(1, ...viewsPerDay.map((v) => v.count));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Headline stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("dashTitle")}</Text>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{listings.length}</Text>
            <Text style={styles.statLabel}>{t("dashStatsListings")}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalViews}</Text>
            <Text style={styles.statLabel}>{t("dashStatsViews")}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{(callbacks.data ?? []).length}</Text>
            <Text style={styles.statLabel}>{t("dashStatsCallbacks")}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{convCount.data ?? 0}</Text>
            <Text style={styles.statLabel}>{t("dashStatsConversations")}</Text>
          </View>
        </View>
        <Button
          title={t("listFurniture")}
          onPress={() => router.push("/sell")}
          style={{ marginTop: 14 }}
        />
      </View>

      {/* Views chart — the web dashboard draws this; keep mobile at parity. */}
      {viewsPerDay.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("dashViewsChart")}</Text>
          <Text style={styles.chartHint}>{t("dashViewsChartHint")}</Text>
          <View style={styles.chartRow}>
            {viewsPerDay.map((v, i) => (
              <View key={v.date} style={styles.chartCol}>
                <View style={styles.chartBarTrack}>
                  <View
                    style={[
                      styles.chartBar,
                      { height: `${Math.max(4, Math.round((v.count / maxDay) * 100))}%` },
                    ]}
                  />
                </View>
                <Text style={styles.chartDay}>
                  {i % 2 === 0 ? v.date.slice(8) : ""}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.chartTotal}>
            {t("dashStatsViews")}: {viewsPerDay.reduce((s, v) => s + v.count, 0)} / {t("dashLast14Days")}
          </Text>
        </View>
      ) : null}

      {/* My listings (manage) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("myListings")}</Text>
        {listings.length === 0 ? (
          <Text style={styles.muted}>{t("dashNoListings")}</Text>
        ) : (
          listings.map((l) => (
            <Pressable key={l.id} style={styles.manageRow} onPress={() => router.push(`/listing/${l.id}`)}>
              {l.listing_images?.[0]?.url ? (
                <Image source={imageSource(l.listing_images[0].url, undefined, 300)} style={styles.manageImg} />
              ) : (
                <View style={[styles.manageImg, styles.manageImgEmpty]}>
                  <Text style={styles.manageEmoji}>🛋️</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.manageTitle}>
                  {l.title}
                </Text>
                <Text style={styles.manageMeta}>
                  {formatBirr(l.price)} · {t("dashStatsViews")}: {l.view_count ?? 0}
                </Text>
                <View style={styles.statusRow}>
                  {["active", "reserved", "sold"].map((s) => (
                    <Pressable
                      key={s}
                      style={[styles.statusChip, l.status === s && styles.statusChipActive]}
                      onPress={() =>
                        void (s === "sold"
                          ? markListingSold(l.id, l.title)
                          : updateListingStatus(l.id, s))
                          .then(() => myListings.refetch())
                          .catch((err) => toast.error(err, t("dashUpdateFailed")))
                      }
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          l.status === s && styles.statusChipTextActive,
                        ]}
                      >
                        {s === "active"
                          ? t("dashStatusActive")
                          : s === "reserved"
                            ? t("dashStatusReserved")
                            : t("dashStatusSold")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.manageActions}>
                <Pressable
                  hitSlop={8}
                  style={styles.manageIconBtn}
                  onPress={() => router.push({ pathname: "/sell", params: { edit: l.id } })}
                >
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  style={styles.manageIconBtn}
                  onPress={() =>
                    setConfirm({
                      title: t("delete"),
                      message: t("dashDeleteConfirm"),
                      label: t("delete"),
                      onConfirm: () => {
                        setConfirm(null);
                        void deleteListing(l.id)
                          .then(() => myListings.refetch())
                          .catch((err) => toast.error(err, t("dashUpdateFailed")));
                      },
                    })
                  }
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            </Pressable>
          ))
        )}
      </View>

      {/* Offers — buyers' price proposals, accept or decline (web parity) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("dashOffers")}</Text>
        {!offers.data || offers.data.length === 0 ? (
          <Text style={styles.muted}>{t("dashNoOffers")}</Text>
        ) : (
          offers.data.map((o) => (
            <View key={o.id} style={styles.cbRow}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.manageTitle}>
                  {o.listings?.title ?? t("listing")} — {formatBirr(o.amount)}
                </Text>
                {o.buyer ? (
                  <Text style={styles.cbNote}>
                    {[o.buyer.full_name, o.buyer.phone].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
                {o.message ? <Text style={styles.cbNote}>“{o.message}”</Text> : null}
                <Text style={styles.cbTime}>{timeAgo(o.created_at)}</Text>
                <Text
                  style={[
                    styles.cbStatus,
                    o.status === "pending"
                      ? { color: colors.warning }
                      : o.status === "accepted"
                        ? { color: colors.success }
                        : { color: colors.textMuted },
                  ]}
                >
                  {o.status === "pending"
                    ? t("dashOfferPending")
                    : o.status === "accepted"
                      ? t("dashOfferAccepted")
                      : o.status === "declined"
                        ? t("dashOfferDeclined")
                        : t("dashOfferCancelled")}
                </Text>
              </View>
              {o.status === "pending" ? (
                <View style={styles.cbActions}>
                  <Pressable
                    style={styles.cbBtn}
                    onPress={() =>
                      void respondToOffer({
                        id: o.id,
                        status: "accepted",
                        buyerId: o.buyer_id,
                        listingTitle: o.listings?.title ?? null,
                        listingId: o.listings?.id ?? o.id,
                        amount: o.amount,
                      })
                        .then(() => {
                          offers.refetch();
                          toast.success(t("offerAccepted"));
                        })
                        .catch((err) => toast.error(err, t("dashUpdateFailed")))
                    }
                  >
                    <Text style={styles.cbBtnText}>{t("dashAcceptOffer")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.cbBtn, styles.cbBtnGhost]}
                    onPress={() =>
                      void respondToOffer({
                        id: o.id,
                        status: "declined",
                        buyerId: o.buyer_id,
                        listingTitle: o.listings?.title ?? null,
                        listingId: o.listings?.id ?? o.id,
                        amount: o.amount,
                      })
                        .then(() => {
                          offers.refetch();
                          toast.success(t("offerDeclined"));
                        })
                        .catch((err) => toast.error(err, t("dashUpdateFailed")))
                    }
                  >
                    <Text style={[styles.cbBtnText, { color: colors.text }]}>
                      {t("dashDeclineOffer")}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>

      {/* Callback requests */}
      {callbacks.data && callbacks.data.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("dashStatsCallbacks")}</Text>
          {callbacks.data.map((c) => (
            <View key={c.id} style={styles.cbRow}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.manageTitle}>
                  {c.listings?.title ?? t("listing")} — {c.phone}
                </Text>
                {c.note ? <Text style={styles.cbNote}>{c.note}</Text> : null}
                <Text style={styles.cbTime}>{timeAgo(c.created_at)}</Text>
                <Text
                  style={[
                    styles.cbStatus,
                    c.status === "pending"
                      ? { color: colors.warning }
                      : c.status === "contacted"
                        ? { color: colors.primary }
                        : { color: colors.textMuted },
                  ]}
                >
                  {c.status === "pending"
                    ? t("dashCbPending")
                    : c.status === "contacted"
                      ? t("dashCbContacted")
                      : t("dashCbClosed")}
                </Text>
              </View>
              {c.status === "pending" ? (
                <View style={styles.cbActions}>
                  <Pressable
                    style={styles.cbBtn}
                    onPress={() =>
                      void updateCallbackStatus(c.id, "contacted", c.buyer_id, c.listings?.title)
                        .then(() => callbacks.refetch())
                        .catch((err) => toast.error(err, t("dashUpdateFailed")))
                    }
                  >
                    <Ionicons name="call" size={13} color={colors.onPrimary} />
                    <Text style={styles.cbBtnText}>{t("dashMarkContacted")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.cbBtn, styles.cbBtnGhost]}
                    onPress={() =>
                      void updateCallbackStatus(c.id, "closed", c.buyer_id, c.listings?.title)
                        .then(() => callbacks.refetch())
                        .catch((err) => toast.error(err, t("dashUpdateFailed")))
                    }
                  >
                    <Text style={[styles.cbBtnText, { color: colors.text }]}>{t("dashClose")}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title ?? ""}
        message={confirm?.message}
        confirmLabel={confirm?.label ?? ""}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 32,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
    marginBottom: 0,
    ...shadows.card,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 8 },
  statRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  statBox: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.primary },
  statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: "center" },
  manageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chartHint: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 120 },
  chartCol: { flex: 1, alignItems: "center" },
  chartBarTrack: {
    width: "100%",
    height: 90,
    backgroundColor: colors.secondary,
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  chartBar: { backgroundColor: colors.primary, borderRadius: 4, minHeight: 3 },
  chartDay: { fontSize: 9, color: colors.textSoft, marginTop: 4 },
  chartTotal: { fontSize: 12, color: colors.textMuted, marginTop: 10, textAlign: "center" },
  manageImg: { width: 44, height: 44, borderRadius: radius.md },
  manageImgEmpty: {
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  manageEmoji: { fontSize: 20 },
  manageTitle: { fontSize: 14, fontWeight: "600", color: colors.text },
  manageMeta: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  statusRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  statusChip: {
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusChipActive: { backgroundColor: colors.primary },
  statusChipText: { fontSize: 10.5, color: colors.textMuted, fontWeight: "600" },
  statusChipTextActive: { color: colors.onPrimary },
  manageActions: { gap: 10 },
  manageIconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  cbRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  cbNote: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  cbTime: { fontSize: 11, color: colors.textSoft, marginTop: 2 },
  cbStatus: { fontSize: 11.5, fontWeight: "700", marginTop: 3, textTransform: "uppercase" },
  cbActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  cbBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cbBtnGhost: { backgroundColor: colors.secondary },
  cbBtnText: { fontSize: 12, color: colors.onPrimary, fontWeight: "700" },
  muted: { fontSize: 13, color: colors.textMuted },
});
