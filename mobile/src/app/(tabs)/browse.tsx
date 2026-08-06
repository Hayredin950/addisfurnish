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
  fetchListings,
  logSearch,
  saveSearch,
  deleteSavedSearch,
  fetchSavedSearches,
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

  const cats = useAsync(fetchCategories, []);

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
            placeholder={t("searchPlaceholder")}
            placeholderTextColor={colors.textSoft}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={applyFilters}
          />
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
        renderItem={({ item }) => <ListingCard listing={item} lang={lang} />}
        onRefresh={refetch}
        refreshing={loading && !!data}
      />

      {/* Filters modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilters(false)}
      >
        <SheetOverlay>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("filters")}</Text>
              <Pressable onPress={() => setShowFilters(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <Text style={styles.label}>{t("category")}</Text>
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
                  <Text style={[styles.chipText, category === c.slug && styles.chipTextActive]}>
                    {lang === "am" ? (c.name_am ?? c.name) : c.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>{t("condition")}</Text>
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

            <Text style={styles.label}>{t("city")}</Text>
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

            <Text style={styles.label}>{t("roomType")}</Text>
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

            <Text style={styles.label}>{t("priceRange")}</Text>
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
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginTop: 14, marginBottom: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
});
