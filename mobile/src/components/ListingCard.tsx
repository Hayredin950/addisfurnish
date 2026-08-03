import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { colors, radius, shadows, font } from "../lib/theme";
import { formatBirr, timeAgo } from "../lib/format";
import { translate } from "../lib/i18n";
import type { Lang } from "../lib/i18n";
import type { Listing } from "../lib/api";

function imageSource(url?: string | null) {
  if (!url) return undefined;
  return { uri: url };
}

export function ListingCard({
  listing,
  lang,
  compact,
}: {
  listing: Listing;
  lang: Lang;
  compact?: boolean;
}) {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const img = listing.listing_images?.[0];
  const off =
    listing.original_price && listing.original_price > listing.price
      ? Math.round(((listing.original_price - listing.price) / listing.original_price) * 100)
      : 0;
  const sold = listing.status === "sold";
  const reserved = listing.status === "reserved";

  return (
    <Pressable
      onPress={() => router.push(`/listing/${listing.id}`)}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.imageWrap}>
        {img ? (
          <Image source={imageSource(img.url)} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>🛋️</Text>
          </View>
        )}
        {off > 0 && !sold && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>-{off}%</Text>
          </View>
        )}
        {sold && (
          <View style={[styles.badge, styles.soldBadge]}>
            <Text style={styles.badgeText}>{t("soldOut")}</Text>
          </View>
        )}
        {reserved && (
          <View style={[styles.badge, styles.reservedBadge]}>
            <Text style={styles.badgeText}>{t("reserved")}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>
          {listing.title}
        </Text>
        {listing.categories?.name ? (
          <Text numberOfLines={1} style={styles.category}>
            {lang === "am"
              ? (listing.categories.name_am ?? listing.categories.name)
              : listing.categories.name}
          </Text>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatBirr(listing.price)}</Text>
          {listing.original_price ? (
            <Text style={styles.oldPrice}>{formatBirr(listing.original_price)}</Text>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{listing.city}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.meta}>{timeAgo(listing.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
    flex: 1,
    maxWidth: "48.5%",
    marginBottom: 14,
  },
  compact: {
    maxWidth: 180,
    minWidth: 150,
  },
  imageWrap: {
    position: "relative",
  },
  image: {
    width: "100%",
    aspectRatio: 1.05,
    backgroundColor: colors.secondary,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 40,
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  soldBadge: {
    backgroundColor: colors.text,
  },
  reservedBadge: {
    backgroundColor: colors.warning,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  body: {
    padding: 10,
  },
  title: {
    ...font.heading,
    fontSize: 14,
    color: colors.text,
  },
  category: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 6,
  },
  price: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
  },
  oldPrice: {
    fontSize: 12,
    color: colors.textSoft,
    textDecorationLine: "line-through",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  meta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  metaDot: {
    color: colors.textSoft,
  },
});
