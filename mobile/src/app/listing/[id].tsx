import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { useAuth } from "../../lib/auth";
import {
  ensureConversation,
  fetchCategories,
  fetchListing,
  fetchListings,
  fetchMyProfile,
  fetchReviews,
  fetchFavoriteIds,
  recordListingView,
  sendMessage,
  submitReview,
  toggleFavorite,
} from "../../lib/api";
import { ListingCard } from "../../components/ListingCard";
import { Button } from "../../components/Button";
import { colors, radius, spacing, shadows, font } from "../../lib/theme";
import { formatBirr, timeAgo, ethiopianDate } from "../../lib/format";
import type { Listing } from "../../lib/api";

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(value) ? "star" : "star-outline"}
          size={size}
          color={colors.warning}
        />
      ))}
    </View>
  );
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useLang();
  const { user } = useAuth();

  const listing = useAsync(() => fetchListing(id!), [id]);
  const reviews = useAsync(
    () => fetchReviews(listing.data?.seller_id ?? ""),
    [listing.data?.seller_id],
  );
  const similar = useAsync(
    () =>
      fetchListings({
        category: listing.data?.categories?.slug,
        limit: 6,
      }),
    [listing.data?.categories?.slug],
  );
  const cats = useAsync(fetchCategories, []);

  const [favIds, setFavIds] = useState<string[]>([]);
  const [msgOpen, setMsgOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [callbackPhone, setCallbackPhone] = useState("");
  const [callbackSent, setCallbackSent] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    if (!id) return;
    void recordListingView(id);
    if (user) {
      void fetchFavoriteIds(user.id).then(setFavIds);
    }
  }, [id, user]);

  const item = listing.data;
  const seller = item?.profiles ?? null;
  const isFav = favIds.includes(id ?? "");
  const off =
    item?.original_price && item.original_price > item.price
      ? Math.round(((item.original_price - item.price) / item.original_price) * 100)
      : 0;

  const discountActive =
    !!item?.discount_expires_at && new Date(item.discount_expires_at).getTime() > Date.now();

  const openConversation = useCallback(async () => {
    if (!user || !item) return;
    setSending(true);
    try {
      const conversationId = await ensureConversation(item.id, user.id, item.seller_id);
      if (message.trim()) {
        await sendMessage(conversationId, user.id, message.trim());
      }
      setMsgOpen(false);
      setMessage("");
      router.push(`/chat/${conversationId}`);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }, [user, item, message]);

  const sendCallback = useCallback(async () => {
    if (!user || !item || !callbackPhone.trim()) return;
    try {
      const { notifyUser } = await import("../../lib/api");
      await notifyUser(item.seller_id, "callback_request", {
        title: item.title,
        listingId: item.id,
        phone: callbackPhone.trim(),
        fromName: user.id,
      });
      setCallbackSent(true);
    } catch {
      // ignore
    }
  }, [user, item, callbackPhone]);

  const submitReviewNow = useCallback(async () => {
    if (!user || !item) return;
    try {
      await submitReview(item.seller_id, user.id, rating, comment);
      setReviewOpen(false);
      setComment("");
      reviews.refetch();
    } catch {
      // ignore
    }
  }, [user, item, rating, comment, reviews]);

  const similarListings = useMemo(
    () => (similar.data ?? []).filter((l) => l.id !== id),
    [similar.data, id],
  );

  if (listing.loading && !item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={styles.oops}>{t("oops")}</Text>
      </View>
    );
  }

  const images = item.listing_images?.length
    ? [...item.listing_images].sort((a, b) => a.position - b.position)
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Photo carousel */}
      <View>
        {images.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setImageIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth))
            }
          >
            {images.map((img) => (
              <Image
                key={img.id}
                source={{ uri: img.url }}
                style={[styles.heroImage, { width: screenWidth }]}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.heroImage, styles.placeholder]}>
            <Text style={styles.placeholderEmoji}>🛋️</Text>
          </View>
        )}
        {item.latitude != null && item.longitude != null ? (
          <View style={styles.mapPin}>
            <Ionicons name="location" size={14} color={colors.onPrimary} />
            <Text style={styles.mapPinText}>
              {item.sub_city ?? item.city} · {item.latitude.toFixed(3)},{item.longitude.toFixed(3)}
            </Text>
          </View>
        ) : null}
        {images.length > 1 ? (
          <View style={styles.dots}>
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
            ))}
          </View>
        ) : null}
        {off > 0 && item.status !== "sold" ? (
          <View style={styles.offBadge}>
            <Text style={styles.offBadgeText}>-{off}%</Text>
          </View>
        ) : null}
      </View>

      {/* Price block */}
      <View style={styles.card}>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatBirr(item.price)}</Text>
          {item.original_price ? (
            <Text style={styles.oldPrice}>{formatBirr(item.original_price)}</Text>
          ) : null}
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>
              {item.status === "sold"
                ? t("soldOut")
                : item.status === "reserved"
                  ? t("reserved")
                  : t("available")}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {item.city}
            {item.sub_city ? ` · ${item.sub_city}` : ""}
          </Text>
          <Text style={styles.meta}>·</Text>
          <Text style={styles.meta}>{timeAgo(item.created_at)}</Text>
          <Text style={styles.meta}>·</Text>
          <Text style={styles.meta}>
            {item.view_count} {t("views")}
          </Text>
        </View>
        {discountActive && item.discount_expires_at ? (
          <View style={styles.discountBanner}>
            <Ionicons name="time-outline" size={15} color={colors.danger} />
            <Text style={styles.discountText}>
              {t("discountEnds")}: {ethiopianDate(item.discount_expires_at)}
            </Text>
          </View>
        ) : null}
        {item.delivery_offered ? (
          <View style={styles.deliveryRow}>
            <Ionicons name="bicycle-outline" size={16} color={colors.success} />
            <Text style={styles.deliveryText}>
              {t("deliveryOffered")}
              {item.delivery_fee != null ? ` · ${formatBirr(item.delivery_fee)}` : ""}
            </Text>
          </View>
        ) : null}
        <View style={styles.favRow}>
          <Pressable
            style={styles.favBtn}
            onPress={async () => {
              if (!user) {
                router.push("/auth");
                return;
              }
              try {
                await toggleFavorite(user.id, item.id, isFav);
                setFavIds((prev) =>
                  isFav ? prev.filter((x) => x !== item.id) : [...prev, item.id],
                );
              } catch {
                // ignore
              }
            }}
          >
            <Ionicons
              name={isFav ? "heart" : "heart-outline"}
              size={19}
              color={isFav ? colors.danger : colors.textMuted}
            />
            <Text style={styles.favLabel}>{isFav ? t("savedListing") : t("saveListing")}</Text>
          </Pressable>
          <Pressable
            style={styles.favBtn}
            onPress={() => {
              try {
                void Share.share({
                  message: `${item.title} — ${formatBirr(item.price)} on AddisFurnish`,
                });
              } catch {
                // ignore
              }
            }}
          >
            <Ionicons name="share-outline" size={18} color={colors.textMuted} />
            <Text style={styles.favLabel}>{t("share")}</Text>
          </Pressable>
        </View>
      </View>

      {/* Seller card */}
      {seller ? (
        <Pressable
          style={styles.card}
          onPress={() => seller.shop_slug && router.push(`/shop/${seller.shop_slug}`)}
        >
          <View style={styles.sellerRow}>
            <View style={styles.avatar}>
              {seller.shop_logo_url ? (
                <Image source={{ uri: seller.shop_logo_url }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="storefront" size={20} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.sellerName}>{seller.shop_name ?? seller.full_name}</Text>
                {seller.verified ? (
                  <Ionicons name="checkmark-circle" size={16} color={colors.info} />
                ) : null}
              </View>
              <Text style={styles.sellerMeta}>
                {seller.city ?? ""} · {seller.is_online ? t("shopOnline") : t("shopOffline")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
          </View>
          <View style={styles.contactRow}>
            <Button
              title={t("messageSeller")}
              size="sm"
              style={{ flex: 1 }}
              onPress={() => {
                if (!user) {
                  router.push("/auth");
                  return;
                }
                setMsgOpen(true);
              }}
            />
            {seller.phone ? (
              <Button
                title={t("callNow")}
                size="sm"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => Linking.openURL(`tel:${seller.phone}`)}
              />
            ) : null}
          </View>
          {seller.whatsapp ? (
            <Pressable
              style={styles.socialRow}
              onPress={() =>
                Linking.openURL(`https://wa.me/${(seller.whatsapp ?? "").replace(/[^0-9]/g, "")}`)
              }
            >
              <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
              <Text style={styles.socialText}>{t("whatsapp")}</Text>
            </Pressable>
          ) : null}
          {seller.telegram ? (
            <Pressable
              style={styles.socialRow}
              onPress={() =>
                Linking.openURL(`https://t.me/${(seller.telegram ?? "").replace("@", "")}`)
              }
            >
              <Ionicons name="paper-plane" size={15} color={colors.info} />
              <Text style={styles.socialText}>{t("telegram")}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      ) : null}

      {/* Details */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("details")}</Text>
        <View style={styles.detailGrid}>
          <DetailItem label={t("condition")} value={item.condition} />
          {item.material ? <DetailItem label={t("material")} value={item.material} /> : null}
          {item.color ? <DetailItem label={t("color")} value={item.color} /> : null}
          {item.room_type ? <DetailItem label={t("roomType")} value={item.room_type} /> : null}
          {item.brand ? <DetailItem label={t("brand")} value={item.brand} /> : null}
          <DetailItem
            label={t("price")}
            value={item.negotiable ? t("negotiable") : t("fixedPrice")}
          />
          {item.categories?.name ? (
            <DetailItem
              label={t("category")}
              value={
                lang === "am"
                  ? (item.categories.name_am ?? item.categories.name)
                  : item.categories.name
              }
            />
          ) : null}
        </View>
        <Text style={styles.descLabel}>{t("description")}</Text>
        <Text style={styles.desc}>{item.description}</Text>
      </View>

      {/* Reviews */}
      <View style={styles.card}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <Text style={styles.sectionTitle}>{t("reviews")}</Text>
          {user && item.seller_id !== user.id ? (
            <Pressable onPress={() => setReviewOpen(true)}>
              <Text style={styles.link}>{t("writeReview")}</Text>
            </Pressable>
          ) : null}
        </View>
        {(reviews.data ?? []).length === 0 ? (
          <Text style={styles.muted}>{t("noResults")}</Text>
        ) : (
          (reviews.data ?? []).slice(0, 4).map((r) => (
            <View key={r.id} style={styles.review}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.reviewAuthor}>
                  {(r.profiles as { full_name?: string } | null)?.full_name ?? t("seller")}
                </Text>
                <Stars value={r.rating} />
              </View>
              {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
            </View>
          ))
        )}
      </View>

      {/* Similar */}
      {similarListings.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitleOuter}>{t("similar")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            {similarListings.map((l) => (
              <ListingCard key={l.id} listing={l} lang={lang} compact />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Message modal */}
      <Modal
        visible={msgOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMsgOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t("messageSeller")}</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t("description")}
              multiline
              style={styles.messageInput}
            />
            <Button
              title={t("send")}
              loading={sending}
              onPress={openConversation}
              disabled={sending}
            />
          </View>
        </View>
      </Modal>

      {/* Callback modal */}
      <Modal
        visible={callbackSent}
        transparent
        animationType="fade"
        onRequestClose={() => setCallbackSent(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.callbackSheet}>
            <Ionicons name="checkmark-circle" size={44} color={colors.success} />
            <Text style={styles.modalTitle}>{t("callbackSent")}</Text>
            <Button title={t("back")} variant="outline" onPress={() => setCallbackSent(false)} />
          </View>
        </View>
      </Modal>

      {/* Review modal */}
      <Modal
        visible={reviewOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t("yourReview")}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginVertical: 12 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable key={i} onPress={() => setRating(i)} hitSlop={6}>
                  <Ionicons
                    name={i <= rating ? "star" : "star-outline"}
                    size={30}
                    color={colors.warning}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={t("comment")}
              multiline
              style={styles.messageInput}
            />
            <Button title={t("submit")} onPress={submitReviewNow} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  oops: { fontSize: 16, color: colors.textMuted },
  heroImage: { width: "100%", height: 300, backgroundColor: colors.secondary },
  placeholder: { alignItems: "center", justifyContent: "center", width: "100%" },
  placeholderEmoji: { fontSize: 64 },
  dots: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.6)" },
  dotActive: { backgroundColor: colors.primary, width: 18 },
  offBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  offBadgeText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  mapPin: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    opacity: 0.92,
  },
  mapPinText: { color: "#fff", fontSize: 11.5, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  price: { fontSize: 26, fontWeight: "800", color: colors.primary },
  oldPrice: { fontSize: 15, color: colors.textSoft, textDecorationLine: "line-through" },
  statusPill: {
    backgroundColor: colors.successLight,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "center",
  },
  statusText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: { ...font.heading, fontSize: 19, color: colors.text, marginTop: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  meta: { fontSize: 12.5, color: colors.textMuted },
  discountBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 12,
  },
  discountText: { fontSize: 12.5, color: colors.danger, fontWeight: "600" },
  deliveryRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  deliveryText: { fontSize: 13, color: colors.success, fontWeight: "600" },
  favRow: { flexDirection: "row", gap: 16, marginTop: 14 },
  favBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  favLabel: { fontSize: 13, color: colors.textMuted },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: 46, height: 46, borderRadius: radius.full },
  sellerName: { fontSize: 15, fontWeight: "700", color: colors.text },
  sellerMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  contactRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  socialRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  socialText: { fontSize: 13, color: colors.text, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 10 },
  sectionTitleOuter: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 14 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detailItem: {
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: "46%",
    flexGrow: 1,
  },
  detailLabel: { fontSize: 11, color: colors.textMuted, textTransform: "uppercase" },
  detailValue: { fontSize: 13.5, color: colors.text, fontWeight: "600", marginTop: 2 },
  descLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginTop: 16,
    marginBottom: 6,
  },
  desc: { fontSize: 14, color: colors.text, lineHeight: 21 },
  link: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  muted: { fontSize: 13, color: colors.textMuted },
  review: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  reviewAuthor: { fontSize: 13, fontWeight: "600", color: colors.text },
  reviewComment: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: 40,
    gap: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  messageInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    minHeight: 90,
    textAlignVertical: "top",
  },
  callbackSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: 14,
    margin: spacing.xl,
  },
});
