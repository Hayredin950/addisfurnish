import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  BookmarkCheck,
  LocateFixed,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ListingCard } from "@/components/ListingCard";
import { CategoryFilterTree } from "@/components/category-filter-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  categoriesQuery,
  categoryCountsQuery,
  listingsQuery,
  logSearch,
  trendingSearchesQuery,
  savedSearchesQuery,
  saveSearch,
  deleteSavedSearch,
  type Category,
  type ListingFilters,
  type SavedSearch,
} from "@/lib/marketplace";
import { categoryAttributesQuery, type CategoryAttributeDef } from "@/lib/attributes";
import { CITIES, CONDITIONS, MATERIALS, ROOM_TYPES, categoryName, haversineKm } from "@/lib/format";

type BrowseSearch = {
  q: string;
  category: string;
  condition: string;
  material: string;
  room: string;
  city: string;
  min: number;
  max: number;
  sort: string;
  /** Phase 6 (§14): JSON-encoded dynamic attribute filters (slug → values). */
  attr: string;
};

/** URL shape of the dynamic attribute filters (slug → values). */
type AttrFilterMap = NonNullable<ListingFilters["attributes"]>;

/** Parse the URL's encoded attribute filters safely. */
export function parseAttrFilters(raw: string | undefined): AttrFilterMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as AttrFilterMap)
      : {};
  } catch {
    return {};
  }
}

const ANY = "any";

export const Route = createFileRoute("/browse")({
  validateSearch: (search: Record<string, unknown>): Partial<BrowseSearch> => ({
    q: typeof search["q"] === "string" ? search["q"] : "",
    category: typeof search["category"] === "string" ? search["category"] : "",
    condition: typeof search["condition"] === "string" ? search["condition"] : "",
    material: typeof search["material"] === "string" ? search["material"] : "",
    room: typeof search["room"] === "string" ? search["room"] : "",
    city: typeof search["city"] === "string" ? search["city"] : "",
    min: Number(search["min"]) > 0 ? Number(search["min"]) : 0,
    max: Number(search["max"]) > 0 ? Number(search["max"]) : 0,
    sort: typeof search["sort"] === "string" ? search["sort"] : "newest",
    attr: typeof search["attr"] === "string" ? search["attr"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Browse Used Furniture — AddisHome" },
      {
        name: "description",
        content:
          "Search second-hand furniture by category, price, condition, material and city across Ethiopia.",
      },
      { property: "og:title", content: "Browse Used Furniture — AddisHome" },
      {
        property: "og:description",
        content: "Filter thousands of pre-owned furniture listings by price, room and condition.",
      },
    ],
  }),
  component: Browse,
});

function Browse() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/browse" });
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t, lang } = useLang();
  const { data: categories } = useQuery(categoriesQuery);
  // Subtree counts, so the tree can say how much a branch actually holds.
  const { data: counts } = useQuery(categoryCountsQuery);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locDenied, setLocDenied] = useState(false);

  const isNearest = search.sort === "nearest";

  // Phase 6 (§14): the selected category's filterable attributes drive both
  // the dynamic filter controls and the server-side attribute narrowing.
  const attrFilters = useMemo(() => parseAttrFilters(search.attr), [search.attr]);
  const categoryId = useMemo(
    () => (categories ?? []).find((c) => c.slug === search.category)?.id ?? null,
    [categories, search.category],
  );
  const { data: attrDefs } = useQuery(categoryAttributesQuery(categoryId));
  const filterableDefs = useMemo(() => (attrDefs ?? []).filter((d) => d.is_filterable), [attrDefs]);

  // Fetch more when sorting by distance — the server sort doesn't know the
  // user's location, so we re-sort client-side.
  const filters: ListingFilters = {};
  if (search.q) filters.q = search.q;
  if (search.category) filters.category = search.category;
  if (search.condition) filters.condition = search.condition;
  if (search.material) filters.material = search.material;
  if (search.room) filters.room = search.room;
  if (search.city) filters.city = search.city;
  if (search.min && search.min > 0) filters.min = search.min;
  if (search.max && search.max > 0) filters.max = search.max;
  if (Object.keys(attrFilters).length > 0) filters.attributes = attrFilters;
  if (isNearest) filters.limit = 200;
  else if (search.sort) filters.sort = search.sort;

  const { data: rawListings, isLoading } = useQuery(listingsQuery(filters));
  const listings = useMemo(() => {
    if (!isNearest || !coords || !rawListings) return rawListings;
    return [...rawListings]
      .map((l) => ({
        l,
        d:
          typeof l.latitude === "number" && typeof l.longitude === "number"
            ? haversineKm(coords.latitude, coords.longitude, l.latitude, l.longitude)
            : Infinity,
      }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.l);
  }, [rawListings, isNearest, coords]);
  const { data: trending } = useQuery(trendingSearchesQuery(8));
  const { data: savedSearches } = useQuery(savedSearchesQuery(user?.id ?? ""));

  const askLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocDenied(false);
      },
      () => setLocDenied(true),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const alreadySaved = (savedSearches ?? []).some(
    (s) =>
      (s.query ?? "") === (search.q ?? "") &&
      (s.filters?.category ?? "") === (search.category ?? "") &&
      Number(s.filters?.min ?? 0) === Number(search.min ?? 0) &&
      Number(s.filters?.max ?? 0) === Number(search.max ?? 0),
  );

  const onSaveSearch = async () => {
    if (!user) {
      toast.info(t("req.title"));
      navigate({ to: "/auth" });
      return;
    }
    try {
      await saveSearch(user.id, {
        query: search.q,
        category: search.category,
        min: search.min,
        max: search.max,
      });
      toast.success(t("toast.searchSaved"));
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
    } catch {
      toast.error(t("toast.requestFailed"));
    }
  };

  const onRemoveSearch = async (s: SavedSearch) => {
    try {
      await deleteSavedSearch(s.id);
      toast.success(t("toast.searchRemoved"));
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
    } catch {
      toast.error(t("toast.requestFailed"));
    }
  };

  // Log searches (debounced) so popular/trending searches stay fresh.
  useEffect(() => {
    const q = search.q;
    if (!q) return;
    const timeout = window.setTimeout(() => logSearch(q), 800);
    return () => window.clearTimeout(timeout);
  }, [search.q]);

  const set = (patch: Partial<BrowseSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) });

  const activeCount =
    [search.q, search.category, search.condition, search.material, search.room, search.city].filter(
      Boolean,
    ).length +
    (search.min ? 1 : 0) +
    (search.max ? 1 : 0) +
    Object.keys(attrFilters).length;

  /** Merge a patch into the URL-encoded attribute filter state. */
  const setAttr = (patch: Record<string, unknown>) => {
    navigate({
      search: (prev) => {
        const next = { ...parseAttrFilters(prev.attr), ...patch };
        for (const k of Object.keys(next)) {
          const v = (next as Record<string, unknown>)[k];
          if (v == null || (Array.isArray(v) && v.length === 0)) delete next[k];
          else if (Array.isArray(v) && v.length === 2 && v.every((x) => x == null)) delete next[k];
        }
        return { ...prev, attr: Object.keys(next).length ? JSON.stringify(next) : "" };
      },
    });
  };

  const roots = (categories ?? []).filter((c) => !c.parent_id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">{t("browse.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isLoading
          ? t("browse.loading")
          : t("browse.itemsAvailable", { count: listings?.length ?? 0 })}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Desktop: the persistent sidebar. */}
        <aside className="hidden lg:block">
          <FilterControls
            search={search}
            set={set}
            setAttr={setAttr}
            categories={categories ?? []}
            counts={counts}
            activeCount={activeCount}
            attrDefs={filterableDefs}
          />
        </aside>

        <div>
          {/* Responsive Action Toolbar */}
          <div className="mb-6 space-y-3">
            {/* Search row */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search.q}
                placeholder={t("nav.searchPlaceholder")}
                onChange={(e) => set({ q: e.target.value })}
                aria-label={t("nav.searchPlaceholder")}
                className="h-11 w-full rounded-xl border-input bg-card pl-10 shadow-sm transition-all focus-visible:ring-primary lg:h-10 lg:rounded-full lg:shadow-none"
              />
            </div>

            {/* Mobile Sort Options (Wrapping Chips) */}
            <div className="flex flex-wrap gap-2 pb-1 lg:hidden">
              {[
                { key: "newest", label: t("browse.newest") },
                { key: "price-asc", label: t("browse.priceAsc") },
                { key: "price-desc", label: t("browse.priceDesc") },
                { key: "viewed", label: t("browse.mostViewed") },
                { key: "nearest", label: t("browse.nearest") },
              ].map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    if (search.sort === o.key && o.key !== "newest") set({ sort: "newest" });
                    else if (o.key === "nearest") {
                      set({ sort: "nearest" });
                      askLocation();
                    } else set({ sort: o.key });
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    search.sort === o.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-card hover:bg-accent"
                  }`}
                >
                  {o.key === "nearest" ? <LocateFixed className="h-3 w-3" /> : null}
                  {o.label}
                  {search.sort === o.key && o.key !== "newest" ? <X className="h-3 w-3" /> : null}
                </button>
              ))}
            </div>

            {/* Actions Row: Filters, Sort, Save */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="relative h-9 rounded-full bg-card px-4 lg:hidden"
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      {t("browse.filters")}
                      {activeCount > 0 ? (
                        <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {activeCount}
                        </span>
                      ) : null}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto pb-20">
                    <SheetTitle className="sr-only">{t("browse.filters")}</SheetTitle>
                    <FilterControls
                      search={search}
                      set={set}
                      setAttr={setAttr}
                      categories={categories ?? []}
                      counts={counts}
                      activeCount={activeCount}
                      attrDefs={filterableDefs}
                    />
                    <SheetClose asChild>
                      <Button className="mt-6 w-full">{t("browse.done")}</Button>
                    </SheetClose>
                  </SheetContent>
                </Sheet>

                {/* Sort Dropdown (Desktop only) */}
                <div className="hidden lg:block">
                  <Select
                    value={search.sort ?? "newest"}
                    onValueChange={(v) => {
                      set({ sort: v });
                      if (v === "nearest") askLocation();
                    }}
                  >
                    <SelectTrigger className="h-9 w-44 rounded-full bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">{t("browse.newest")}</SelectItem>
                      <SelectItem value="price-asc">{t("browse.priceAsc")}</SelectItem>
                      <SelectItem value="price-desc">{t("browse.priceDesc")}</SelectItem>
                      <SelectItem value="viewed">{t("browse.mostViewed")}</SelectItem>
                      <SelectItem value="nearest">{t("browse.nearest")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Desktop Categories & Desktop Save */}
              <div className="hidden items-center gap-2 lg:flex">
                <div className="mr-4 flex gap-2">
                  {roots.slice(0, 4).map((c) => (
                    <Link
                      key={c.id}
                      to="/browse"
                      search={(prev) => ({ ...prev, category: c.slug })}
                      className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                    >
                      {categoryName(c, lang)}
                    </Link>
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={alreadySaved}
                onClick={onSaveSearch}
                className="h-9 rounded-full bg-card px-4"
              >
                {alreadySaved ? (
                  <BookmarkCheck className="mr-2 h-4 w-4 text-primary" />
                ) : (
                  <Bookmark className="mr-2 h-4 w-4" />
                )}
                <span className="hidden sm:inline">{t("browse.saveSearch")}</span>
                <span className="sm:hidden">Save</span>
              </Button>
            </div>
          </div>

          {isNearest && locDenied ? (
            <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <LocateFixed className="h-3.5 w-3.5 text-primary" />
              {t("browse.locDenied")}{" "}
              <button
                type="button"
                onClick={askLocation}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {t("browse.useMyLocation")}
              </button>
            </p>
          ) : null}

          {user && (savedSearches ?? []).length > 0 ? (
            <div className="mb-5 rounded-lg border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Bookmark className="h-3.5 w-3.5" /> {t("browse.savedSearches")}
              </p>
              <ul className="mt-2 space-y-1">
                {(savedSearches ?? []).map((s) => (
                  <li
                    key={s.id}
                    className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left"
                      onClick={() =>
                        navigate({
                          search: {
                            q: s.query ?? "",
                            category: s.filters?.category ?? "",
                            condition: "",
                            material: "",
                            room: "",
                            city: "",
                            min: s.filters?.min ?? 0,
                            max: s.filters?.max ?? 0,
                            sort: "newest",
                          },
                        })
                      }
                    >
                      <span className="font-medium">{s.query || t("browse.allItems")}</span>
                      {s.filters?.category ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          · {s.filters.category}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => onRemoveSearch(s)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {trending && trending.length > 0 ? (
            <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span>{t("browse.popular")}:</span>
              {trending.slice(0, 5).map((term) => (
                <Link
                  key={term}
                  to="/browse"
                  search={(prev) => ({ ...prev, q: term })}
                  className="rounded-full bg-secondary px-2.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {term}
                </Link>
              ))}
            </div>
          ) : null}

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-4/5 w-full rounded-lg" />
              ))}
            </div>
          ) : listings && listings.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-16 text-center">
              <p className="font-display text-lg">{t("browse.emptyTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("browse.emptyBody")}</p>
              <Button asChild variant="outline" className="mt-5">
                <Link to="/sell">{t("browse.emptyCta")}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The browse filter form — rendered twice: as the desktop sidebar (`lg+`) and
 * inside the mobile bottom sheet, so both breakpoints share one control set.
 */
function FilterControls({
  search,
  set,
  setAttr,
  categories,
  counts,
  activeCount,
  attrDefs,
}: {
  search: Partial<BrowseSearch>;
  set: (patch: Partial<BrowseSearch>) => void;
  setAttr: (patch: Record<string, unknown>) => void;
  categories: Category[];
  counts: Record<string, number> | undefined;
  activeCount: number;
  attrDefs: CategoryAttributeDef[];
}) {
  const { t, lang } = useLang();
  const attr = useMemo(() => parseAttrFilters(search.attr), [search.attr]);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm font-medium">
        <SlidersHorizontal className="h-4 w-4" /> {t("browse.filters")}
        {activeCount > 0 ? (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 text-xs text-primary"
            onClick={() =>
              set({
                q: "",
                category: "",
                condition: "",
                material: "",
                room: "",
                city: "",
                min: 0,
                max: 0,
                sort: "newest",
                attr: "",
              })
            }
          >
            <X className="h-3 w-3" /> {t("browse.clear", { count: activeCount })}
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="q">{t("browse.keyword")}</Label>
        <Input
          id="q"
          value={search.q}
          placeholder="e.g. sofa"
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>

      <CategoryFilterTree
        label={t("browse.category")}
        categories={categories}
        counts={counts}
        value={search.category ?? ""}
        onChange={(v) => set({ category: v })}
      />
      <FilterSelect
        label={t("browse.condition")}
        value={search.condition ?? ""}
        onChange={(v) => set({ condition: v })}
        options={CONDITIONS.map((c) => ({ value: c, label: c }))}
      />
      <FilterSelect
        label={t("browse.material")}
        value={search.material ?? ""}
        onChange={(v) => set({ material: v })}
        options={MATERIALS.map((c) => ({ value: c, label: c }))}
      />
      <FilterSelect
        label={t("browse.room")}
        value={search.room ?? ""}
        onChange={(v) => set({ room: v })}
        options={ROOM_TYPES.map((c) => ({ value: c, label: c }))}
      />
      <FilterSelect
        label={t("browse.city")}
        value={search.city ?? ""}
        onChange={(v) => set({ city: v })}
        options={CITIES.map((c) => ({ value: c, label: c }))}
      />

      <div className="space-y-2">
        <Label>{t("browse.priceRange")}</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={search.min || ""}
            placeholder={t("browse.min")}
            onChange={(e) => set({ min: Number(e.target.value) || 0 })}
          />
          <Input
            type="number"
            min={0}
            value={search.max || ""}
            placeholder={t("browse.max")}
            onChange={(e) => set({ max: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* Phase 6 (§14): dynamic attribute filters — only the attributes the
          selected category configures appear, loaded live from the backend. */}
      {attrDefs.length ? (
        <div className="space-y-4 border-t pt-4">
          {attrDefs.map((def) => {
            const current = attr[def.slug];
            if (def.type === "single_select" || def.type === "multi_select") {
              const selValue = typeof current === "string" ? current : "";
              return (
                <FilterSelect
                  key={def.attribute_id}
                  label={`${lang === "am" && def.name_am ? def.name_am : def.name}${def.is_required ? " *" : ""}`}
                  value={selValue}
                  onChange={(v) => setAttr({ [def.slug]: v ? [v] : [] })}
                  options={def.options.map((o) => ({
                    value: o.value,
                    label: lang === "am" && o.label_am ? o.label_am : o.label,
                  }))}
                />
              );
            }
            if (def.type === "boolean") {
              const first = Array.isArray(current) ? current[0] : null;
              const boolStr = first === true ? "true" : first === false ? "false" : "";
              return (
                <FilterSelect
                  key={def.attribute_id}
                  label={lang === "am" && def.name_am ? def.name_am : def.name}
                  value={boolStr}
                  onChange={(v) => setAttr({ [def.slug]: v ? [v === "true"] : [] })}
                  options={[
                    { value: "true", label: t("browse.yes") },
                    { value: "false", label: t("browse.no") },
                  ]}
                />
              );
            }
            if (def.type === "number" || def.type === "range") {
              const tuple = Array.isArray(current) ? current : null;
              const lo = typeof tuple?.[0] === "number" ? tuple[0] : "";
              const hi = typeof tuple?.[1] === "number" ? tuple[1] : "";
              return (
                <div key={def.attribute_id} className="space-y-2">
                  <Label>
                    {lang === "am" && def.name_am ? def.name_am : def.name}
                    {def.unit ? ` (${def.unit})` : ""}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={lo}
                      placeholder={t("browse.min")}
                      onChange={(e) =>
                        setAttr({
                          [def.slug]: [
                            [
                              e.target.value ? Number(e.target.value) : null,
                              typeof tuple?.[1] === "number" ? tuple[1] : null,
                            ],
                          ],
                        })
                      }
                    />
                    <Input
                      type="number"
                      value={hi}
                      placeholder={t("browse.max")}
                      onChange={(e) =>
                        setAttr({
                          [def.slug]: [
                            [
                              typeof tuple?.[0] === "number" ? tuple[0] : null,
                              e.target.value ? Number(e.target.value) : null,
                            ],
                          ],
                        })
                      }
                    />
                  </div>
                </div>
              );
            }
            // text
            return (
              <div key={def.attribute_id} className="space-y-2">
                <Label>{lang === "am" && def.name_am ? def.name_am : def.name}</Label>
                <Input
                  value={typeof current === "string" ? current : ""}
                  onChange={(e) => setAttr({ [def.slug]: e.target.value ? [e.target.value] : [] })}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const { t } = useLang();
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder={t("browse.any", { label: label.toLowerCase() })} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("browse.any", { label: label.toLowerCase() })}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="capitalize">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
