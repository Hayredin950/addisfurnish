import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { useFavorites } from "../../hooks/use-favorites";
import { fetchListings, fetchReviews, fetchShop } from "../../lib/api";
import { ListingCard } from "../../components/ListingCard";
import { EmptyState } from "../../components/EmptyState";
import { colors, radius, spacing, shadows } from "../../lib/theme";
import { imageSource } from "../../lib/storage";

function Stars({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(value) ? "star" : "star-outline"}
          size={13}
          color={colors.warning}
        />
      ))}
    </View>
  );
}

export default function ShopScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, lang } = useLang();
  const favs = useFavorites();

  const shop = useAsync(() => fetchShop(slug ?? ""), [slug]);
  const listings = useAsync(
    () => fetchListings({ sellerId: shop.data?.id ?? "", limit: 50 }),
    [shop.data?.id],
  );
  const reviews = useAsync(() => fetchReviews(shop.data?.id ?? ""), [shop.data?.id]);

  const profile = shop.data;

  if (shop.loading && !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.oops}>{t("oops")}</Text>
      </View>
    );
  }

  const avgRating =
    (reviews.data ?? []).length > 0
      ? (reviews.data ?? []).reduce((s, r) => s + r.rating, 0) / (reviews.data ?? []).length
      : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Shop header */}
      <View style={styles.header}>
        <View style={styles.logo}>
          {profile.shop_logo_url ? (
            <Image source={imageSource(profile.shop_logo_url, undefined, 300)} style={styles.logoImg} />
          ) : (
            <Ionicons name="storefront" size={34} color={colors.primary} />
          )}
        </View>
        <Text style={styles.shopName}>{profile.shop_name ?? profile.full_name}</Text>
        {profile.verified ? (
          <View style={styles.verifiedPill}>
            <Ionicons name="checkmark-circle" size={14} color={colors.info} />
            <Text style={styles.verifiedText}>{t("shopVerified")}</Text>
          </View>
        ) : null}
        <Text style={styles.shopMeta}>
          {profile.city ?? ""}
          {profile.is_online ? ` · ${t("shopOnline")}` : ` · ${t("shopOffline")}`}
        </Text>
        {profile.shop_description ? (
          <Text style={styles.shopDesc}>{profile.shop_description}</Text>
        ) : null}
        <View style={styles.actions}>
          {profile.phone ? (
            <Pressable
              style={styles.actionBtn}
              onPress={() => Linking.openURL(`tel:${profile.phone}`)}
            >
              <Ionicons name="call" size={17} color={colors.primary} />
              <Text style={styles.actionText}>{t("callNow")}</Text>
            </Pressable>
          ) : null}
          {profile.whatsapp ? (
            <Pressable
              style={styles.actionBtn}
              onPress={() =>
                Linking.openURL(`https://wa.me/${(profile.whatsapp ?? "").replace(/[^0-9]/g, "")}`)
              }
            >
              <Ionicons name="logo-whatsapp" size={17} color={colors.success} />
              <Text style={styles.actionText}>{t("whatsapp")}</Text>
            </Pressable>
          ) : null}
          {profile.telegram ? (
            <Pressable
              style={styles.actionBtn}
              onPress={() =>
                Linking.openURL(`https://t.me/${(profile.telegram ?? "").replace("@", "")}`)
              }
            >
              <Ionicons name="paper-plane" size={16} color={colors.info} />
              <Text style={styles.actionText}>{t("telegram")}</Text>
            </Pressable>
          ) : null}
        </View>
        {avgRating > 0 ? (
          <View style={styles.ratingRow}>
            <Stars value={avgRating} />
            <Text style={styles.ratingText}>
              {avgRating.toFixed(1)} · {(reviews.data ?? []).length} {t("reviews")}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Listings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("myListings")}</Text>
        {(listings.data ?? []).length === 0 ? (
          <EmptyState title={t("emptyShop")} />
        ) : (
          <View style={styles.grid}>
            {(listings.data ?? []).map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                lang={lang}
                isFav={favs.isFav(l.id)}
                onToggleFav={favs.toggle}
              />
            ))}
          </View>
        )}
      </View>

      {/* Reviews */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("reviews")}</Text>
        {(reviews.data ?? []).length === 0 ? (
          <Text style={styles.muted}>{t("noReviews")}</Text>
        ) : (
          (reviews.data ?? []).map((r) => (
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
  },
  oops: { fontSize: 16, color: colors.textMuted },
  header: {
    backgroundColor: colors.card,
    padding: spacing.xl,
    alignItems: "center",
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadows.card,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: { width: 76, height: 76, borderRadius: radius.full },
  shopName: { fontSize: 21, fontWeight: "800", color: colors.text, marginTop: 12 },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: 8,
  },
  verifiedText: { fontSize: 12, color: colors.info, fontWeight: "600" },
  shopMeta: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
  shopDesc: {
    fontSize: 13,
    color: colors.text,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionText: { fontSize: 13, color: colors.text, fontWeight: "600" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  ratingText: { fontSize: 13, color: colors.textMuted },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  muted: { fontSize: 13, color: colors.textMuted },
  review: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  reviewAuthor: { fontSize: 13, fontWeight: "600", color: colors.text },
  reviewComment: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
});
