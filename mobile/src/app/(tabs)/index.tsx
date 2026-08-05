import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { fetchCategories, fetchListings, fetchTrendingSearches, logSearch } from "../../lib/api";
import { ListingCard } from "../../components/ListingCard";
import { SectionHeader } from "../../components/SectionHeader";
import { EmptyState } from "../../components/EmptyState";
import { colors, radius, spacing, shadows } from "../../lib/theme";
import { categoryIcon } from "../../lib/category-icons";

export default function HomeScreen() {
  const { t, lang } = useLang();
  const [term, setTerm] = useState("");

  const cats = useAsync(fetchCategories, []);
  const featured = useAsync(() => fetchListings({ featured: true, limit: 10 }), []);
  const fresh = useAsync(() => fetchListings({ limit: 10 }), []);
  const trending = useAsync(fetchTrendingSearches, []);

  const submit = (q?: string) => {
    const value = (q ?? term).trim();
    if (!value) return;
    void logSearch(value);
    router.push({ pathname: "/browse", params: { q: value } });
  };

  const rootCats = (cats.data ?? []).filter((c) => !c.parent_id);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{t("appName")}</Text>
        <Text style={styles.heroTagline}>{t("tagline")}</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder={t("searchPlaceholder")}
            placeholderTextColor={colors.textSoft}
            style={styles.searchInput}
            onSubmitEditing={() => submit()}
            returnKeyType="search"
          />
          {term ? (
            <Pressable onPress={() => setTerm("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textSoft} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Trending */}
      {(trending.data ?? []).length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title={t("trending")} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {(trending.data ?? []).map((q, i) => (
              <Pressable
                key={`${q}-${i}`}
                style={styles.chip}
                onPress={() => {
                  setTerm(q);
                  submit(q);
                }}
              >
                <Ionicons name="trending-up" size={14} color={colors.primary} />
                <Text style={styles.chipText}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Categories */}
      <View style={styles.section}>
        <SectionHeader
          title={t("categories")}
          action={t("seeAll")}
          onAction={() => router.push("/browse")}
        />
        <View style={styles.catGrid}>
          {(rootCats.length > 0 ? rootCats : (cats.data ?? [])).slice(0, 8).map((c) => (
            <Pressable
              key={c.id}
              style={styles.catItem}
              onPress={() => router.push({ pathname: "/browse", params: { category: c.slug } })}
            >
              <View style={styles.catIcon}>
                <Ionicons name={categoryIcon(c.icon)} size={24} color={colors.primary} />
              </View>
              <Text numberOfLines={2} style={styles.catName}>
                {lang === "am" ? (c.name_am ?? c.name) : c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Featured */}
      <View style={styles.section}>
        <SectionHeader title={t("featured")} />
        {featured.loading && !featured.data ? (
          <Text style={styles.loading}>{t("loading")}</Text>
        ) : (featured.data ?? []).length === 0 ? (
          <EmptyState title={t("noResults")} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            {(featured.data ?? []).map((l) => (
              <ListingCard key={l.id} listing={l} lang={lang} compact />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Fresh */}
      <View style={styles.section}>
        <SectionHeader
          title={t("fresh")}
          action={t("seeAll")}
          onAction={() => router.push("/browse")}
        />
        {fresh.loading && !fresh.data ? (
          <Text style={styles.loading}>{t("loading")}</Text>
        ) : (fresh.data ?? []).length === 0 ? (
          <EmptyState title={t("noResults")} />
        ) : (
          <View style={styles.grid}>
            {(fresh.data ?? []).slice(0, 6).map((l) => (
              <ListingCard key={l.id} listing={l} lang={lang} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "700",
    fontFamily: "Georgia, serif",
    color: colors.primaryDark,
  },
  heroTagline: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadows.card,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    padding: 0,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: 13,
    color: colors.text,
  },
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  catItem: {
    width: "22.5%",
    alignItems: "center",
    gap: 6,
  },
  catIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  catName: {
    fontSize: 11,
    color: colors.text,
    textAlign: "center",
  },
  loading: {
    fontSize: 13,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    // `gap` rather than space-between: with an odd number of cards the last row
    // would otherwise push its single card full-width and the rows read as one
    // block. Cards set their own 48% width.
    gap: 12,
  },
});
