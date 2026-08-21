import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import { useAuth } from "../../lib/auth";
import {
  fetchCategories,
  fetchFavoriteIds,
  fetchListings,
  fetchSavedSearches,
  fetchTrendingSearches,
  logSearch,
  saveSearch,
  deleteSavedSearch,
  toggleFavorite,
} from "../../lib/api";
import { ListingCard } from "../../components/ListingCard";
import { SheetOverlay } from "../../components/SheetOverlay";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/Button";
import { colors, radius, spacing } from "../../lib/theme";
import { haversineKm } from "../../lib/format";

const CITIES = ["Addis Ababa", "Dire Dawa", "Hawassa", "Bahir Dar", "Mekelle", "Adama", "Gondar"];
const ROOM_TYPES = ["Living Room", "Bedroom", "Dining", "Office", "Outdoor", "Kitchen"];

type SortKey = "newest" | "price-asc" | "price-desc" | "viewed" | "nearest";

export default function BrowseScreen() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ q?: string; category?: string }>();

  const [q, setQ] = useState(params.q ?? "");
  const [appliedQ, setAppliedQ] = useState(params.q ?? "");
  const [category, setCategory] = useState(params.category ?? "");
  const [focused, setFocused] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [condition, setCondition] = useState("");
  const [city, setCity] = useState("");
  const [room, setRoom] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [savedCurrent, setSavedCurrent] = useState(false);
  const [favIds, setFavIds] = useState<string[]>([]);

  // Load the user's favourite listing ids.
  useEffect(() => {
    if (!user) return;
    void fetchFavoriteIds(user.id).then(setFavIds);
  }, [user?.id]);

  const handleToggleFav = async (listingId: string, isFav: boolean) => {
    if (!user) return;
    try {
      await toggleFavorite(user.id, listingId, isFav);
      setFavIds((prev) =>
        isFav ? prev.filter((x) => x !== listingId) : [...prev, listingId],
      );
    } catch { /* ignore */ }
  };

  const cats = useAsync(fetchCategories, []);
  const trending = useAsync(fetchTrendingSearches, []);
  const mySaved = useAsync(
    () => (user ? fetchSavedSearches(user.id) : Promise.resolve([])),
    [user?.id],
    !!user,
  );

  // Home screen navigates here with ?q= / ?category= — sync them into the form
  // even when this screen is already mounted (params only seed state on mount).
  useEffect(() => {
    if (params.q !== undefined) {
      setQ(params.q);
      setAppliedQ(params.q);
    }
    if (params.category !== undefined) setCategory(params.category);
  }, [params.q, params.category]);

  // Instant search: typing filters the grid live (debounced) instead of
  // waiting for the keyboard's search key. Clearing the box clears the filter.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next !== appliedQ) {
        setAppliedQ(next);
        if (next) void logSearch(next);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data, error, loading, refetch } = useAsync(
    () =>
      fetchListings({
        q: appliedQ || undefined,
        category: category || undefined,
        min: min ? Number(min) : undefined,
        max: max ? Number(max) : undefined,
        condition: condition || undefined,
        city: city || undefined,
        room: room || undefined,
        sort: sort === "nearest" ? undefined : sort,
        limit: 60,
      }),
    [appliedQ, category, min, max, condition, city, room, sort],
  );

  const listings = useMemo(() => {
    const items = data ?? [];
    if (sort === "nearest" && location) {
      return [...items].sort((a, b) => {
        const da =
          a.latitude != null && a.longitude != null
            ? haversineKm(location.lat, location.lon, a.latitude, a.longitude)
            : Infinity;
        const db =
          b.latitude != null && b.longitude != null
            ? haversineKm(location.lat, location.lon, b.latitude, b.longitude)
            : Infinity;
        return da - db;
      });
    }
    return items;
  }, [data, sort, location]);

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("denied");
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      setSort("nearest");
    } catch {
      setLocation(null);
    } finally {
      setLocating(false);
    }
  }, []);

  const applyFilters = () => {
    setAppliedQ(q.trim());
    setShowFilters(false);
    if (q.trim()) void logSearch(q.trim());
  };

  /** Tap a suggestion (category / trending / saved search) → filter now. */
  const applySuggestion = (nextQ: string, nextCat?: string) => {
    setQ(nextQ);
    setAppliedQ(nextQ);
    setCategory(nextCat ?? category);
    setFocused(false);
    if (nextQ) void logSearch(nextQ);
  };

  const clearFilters = () => {
    setQ("");
    setAppliedQ("");
    setCategory("");
    setMin("");
    setMax("");
    setCondition("");
    setCity("");
    setRoom("");
    setSort("newest");
    setLocation(null);
  };

  // Reflect whether the current search (query + category) is already saved.
  useEffect(() => {
    if (!user || !(appliedQ || category)) {
      setSavedCurrent(false);
      return;
    }
    let active = true;
    void fetchSavedSearches(user.id).then((rows) => {
      if (!active) return;
      const match = rows.find(
        (r) =>
          (r.query ?? "") === appliedQ &&
          ((r.filters as { category?: string })?.category ?? "") === category,
      );
      setSavedCurrent(!!match);
    });
    return () => {
      active = false;
    };
  }, [user, appliedQ, category]);

  const toggleSaveSearch = async () => {
    if (!user) return;
    try {
      const rows = await fetchSavedSearches(user.id);
      const match = rows.find(
        (r) =>
          (r.query ?? "") === appliedQ &&
          ((r.filters as { category?: string })?.category ?? "") === category,
      );
      if (match) {
        await deleteSavedSearch(match.id);
        setSavedCurrent(false);
      } else {
        await saveSearch(user.id, {
          query: appliedQ,
          category: category || undefined,
          min: min ? Number(min) : undefined,
          max: max ? Number(max) : undefined,
        });
        setSavedCurrent(true);
      }
    } catch {
      // ignore
    }
  };

  const activeFilterCount =
    (category ? 1 : 0) +
    (condition ? 1 : 0) +
    (city ? 1 : 0) +
    (room ? 1 : 0) +
    (min || max ? 1 : 0) +
    (sort !== "newest" ? 1 : 0);

  const options: { key: SortKey; label: string }[] = [
    { key: "newest", label: t("sortNewest") },
    { key: "price-asc", label: t("sortPriceLow") },
    { key: "price-desc", label: t("sortPriceHigh") },
    { key: "viewed", label: t("sortViewed") },
    { key: "nearest", label: t("sortNearest") },
  ];

  const header = (
    <View>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={t("searchPlaceholder")}
            placeholderTextColor={colors.textSoft}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={applyFilters}
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textSoft} />
            </Pressable>
          ) : null}
        </View>
        <Pressable style={styles.filterBtn} onPress={() => setShowFilters(true)}>
          <Ionicons name="options-outline" size={20} color={colors.primary} />
          {activeFilterCount > 0 ? <View style={styles.filterDot} /> : null}
        </Pressable>
        <Pressable
          style={styles.filterBtn}
          onPress={toggleSaveSearch}
          disabled={!user || !(appliedQ || category)}
        >
          <Ionicons
            name={savedCurrent ? "bookmark" : "bookmark-outline"}
            size={20}
            color={savedCurrent ? colors.primary : colors.textMuted}
          />
        </Pressable>
      </View>

      {/* Suggestions — categories, most-searched and saved searches. Tapping
          one applies it immediately (this was the bug: chips set state but
          never triggered the search). */}
      {focused && !q.trim() ? (
        <View style={styles.suggestions}>
          {(cats.data ?? []).some((c) => !c.parent_id) ? (
            <>
              <Text style={styles.suggestTitle}>{t("categories")}</Text>
              <View style={styles.chipWrap}>
                {(cats.data ?? [])
                  .filter((c) => !c.parent_id)
                  .slice(0, 6)
                  .map((c) => (
                    <Pressable
                      key={c.id}
                      style={styles.suggestChip}
                      onPress={() => applySuggestion("", c.slug)}
                    >
                      <Text style={styles.suggestChipText}>
                        {lang === "am" ? (c.name_am ?? c.name) : c.name}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            </>
          ) : null}

          {(trending.data ?? []).length > 0 ? (
            <>
              <Text style={styles.suggestTitle}>{t("trending")}</Text>
              <View style={styles.chipWrap}>
                {(trending.data ?? []).slice(0, 6).map((term, i) => (
                  <Pressable
                    key={`${term}-${i}`}
                    style={styles.suggestChip}
                    onPress={() => applySuggestion(term)}
                  >
                    <Ionicons name="trending-up" size={12} color={colors.primary} />
                    <Text style={styles.suggestChipText}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {(mySaved.data ?? []).length > 0 ? (
            <>
              <Text style={styles.suggestTitle}>{t("savedSearches")}</Text>
              <View style={styles.chipWrap}>
                {(mySaved.data ?? []).slice(0, 6).map((s) => (
                  <Pressable
                    key={s.id}
                    style={styles.suggestChip}
                    onPress={() =>
                      applySuggestion(
                        s.query ?? "",
                        (s.filters as { category?: string } | null)?.category,
                      )
                    }
                  >
                    <Ionicons name="bookmark" size={12} color={colors.primary} />
                    <Text style={styles.suggestChipText}>
                      {s.query ?? (s.filters as { category?: string } | null)?.category}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {/* Sort chips */}
      <ScrollableChips>
        {options.map((o) => (
          <Pressable
            key={o.key}
            style={[styles.chip, sort === o.key && styles.chipActive]}
            onPress={() => {
              if (o.key === "nearest") {
                void locate();
              } else {
                setSort(o.key);
              }
            }}
          >
            {o.key === "nearest" && locating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons
                name={o.key === "nearest" ? "navigate" : undefined}
                size={13}
                color={sort === o.key ? colors.onPrimary : colors.textMuted}
              />
            )}
            <Text style={[styles.chipText, sort === o.key && styles.chipTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </ScrollableChips>
      {locating ? <Text style={styles.locating}>{t("locating")}</Text> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={listings}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading && !data ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <EmptyState
              title={error ? t("noConnection") : t("noResults")}
              hint={error ? t("retry") : undefined}
            />
          )
        }
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            lang={lang}
            isFav={favIds.includes(item.id)}
            onToggleFav={handleToggleFav}
          />
        )}
        onRefresh={refetch}
        refreshing={loading && !!data}
      />

      {/* Filters modal — scrollable, with collapsible groups so the long list
          of options doesn't fill the screen at once. */}
      <Modal
        visible={showFilters}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilters(false)}
      >
        <SheetOverlay onClose={() => setShowFilters(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("filters")}</Text>
              <Pressable onPress={() => setShowFilters(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.filterScroll} keyboardShouldPersistTaps="handled">
              <FilterGroup
                title={t("category")}
                active={category ? 1 : 0}
                defaultOpen={!!category || !condition && !city && !room}
              >
                <View style={styles.chipWrap}>
                  <Pressable
                    style={[styles.chip, !category && styles.chipActive]}
                    onPress={() => setCategory("")}
                  >
                    <Text style={[styles.chipText, !category && styles.chipTextActive]}>All</Text>
                  </Pressable>
                  {(cats.data ?? []).map((c) => (
                    <Pressable
                      key={c.id}
                      style={[styles.chip, category === c.slug && styles.chipActive]}
                      onPress={() => setCategory(category === c.slug ? "" : c.slug)}
                    >
                      <Text
                        style={[styles.chipText, category === c.slug && styles.chipTextActive]}
                      >
                        {lang === "am" ? (c.name_am ?? c.name) : c.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </FilterGroup>

              <FilterGroup title={t("condition")} active={condition ? 1 : 0} defaultOpen={!!condition}>
                <View style={styles.chipWrap}>
                  {["New", "Used - Like New", "Used - Good", "Used - Fair"].map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.chip, condition === c && styles.chipActive]}
                      onPress={() => setCondition(condition === c ? "" : c)}
                    >
                      <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </FilterGroup>

              <FilterGroup title={t("city")} active={city ? 1 : 0} defaultOpen={!!city}>
                <View style={styles.chipWrap}>
                  {CITIES.map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.chip, city === c && styles.chipActive]}
                      onPress={() => setCity(city === c ? "" : c)}
                    >
                      <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              </FilterGroup>

              <FilterGroup title={t("roomType")} active={room ? 1 : 0} defaultOpen={!!room}>
                <View style={styles.chipWrap}>
                  {ROOM_TYPES.map((r) => (
                    <Pressable
                      key={r}
                      style={[styles.chip, room === r && styles.chipActive]}
                      onPress={() => setRoom(room === r ? "" : r)}
                    >
                      <Text style={[styles.chipText, room === r && styles.chipTextActive]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </FilterGroup>

              <FilterGroup title={t("priceRange")} active={min || max ? 1 : 0} defaultOpen={!!(min || max)}>
                <View style={styles.priceRow}>
                  <TextInput
                    value={min}
                    onChangeText={setMin}
                    placeholder={t("min")}
                    keyboardType="number-pad"
                    placeholderTextColor={colors.textSoft}
                    style={styles.priceInput}
                  />
                  <Text style={styles.priceSep}>{t("to")}</Text>
                  <TextInput
                    value={max}
                    onChangeText={setMax}
                    placeholder={t("max")}
                    keyboardType="number-pad"
                    placeholderTextColor={colors.textSoft}
                    style={styles.priceInput}
                  />
                </View>
              </FilterGroup>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button title={t("reset")} variant="ghost" onPress={clearFilters} />
              <Button title={t("apply")} onPress={applyFilters} />
            </View>
          </View>
        </SheetOverlay>
      </Modal>
    </View>
  );
}

function ScrollableChips({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
      style={styles.chipsRow}
    >
      {children}
    </ScrollView>
  );
}

/** Collapsible filter section — saves space when the sheet is long. */
function FilterGroup({
  title,
  active,
  defaultOpen,
  children,
}: {
  title: string;
  active: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.filterGroup}>
      <Pressable style={styles.filterGroupHeader} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.filterGroupTitle}>
          {title}
          {active > 0 ? <Text style={styles.filterGroupActive}> · {active}</Text> : null}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>
      {open ? <View style={styles.filterGroupBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  chipsRow: { marginTop: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12.5, color: colors.text },
  chipTextActive: { color: colors.onPrimary, fontWeight: "600" },
  locating: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: 40,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  filterScroll: { flexGrow: 0 },
  filterGroup: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 4,
  },
  filterGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  filterGroupTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  filterGroupActive: { color: colors.primary },
  filterGroupBody: { paddingBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginTop: 14, marginBottom: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestions: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 6,
  },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  suggestChipText: { fontSize: 12.5, color: colors.text, fontWeight: "600" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  priceInput: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  priceSep: { color: colors.textMuted },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 16 },
});
