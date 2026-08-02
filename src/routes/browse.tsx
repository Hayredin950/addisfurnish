import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoriesQuery, listingsQuery } from "@/lib/marketplace";
import { CITIES, CONDITIONS, MATERIALS, ROOM_TYPES } from "@/lib/format";

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
};

const ANY = "any";

export const Route = createFileRoute("/browse")({
  validateSearch: (search: Record<string, unknown>): BrowseSearch => ({
    q: typeof search["q"] === "string" ? search["q"] : "",
    category: typeof search["category"] === "string" ? search["category"] : "",
    condition: typeof search["condition"] === "string" ? search["condition"] : "",
    material: typeof search["material"] === "string" ? search["material"] : "",
    room: typeof search["room"] === "string" ? search["room"] : "",
    city: typeof search["city"] === "string" ? search["city"] : "",
    min: Number(search["min"]) > 0 ? Number(search["min"]) : 0,
    max: Number(search["max"]) > 0 ? Number(search["max"]) : 0,
    sort: typeof search["sort"] === "string" ? search["sort"] : "newest",
  }),
  head: () => ({
    meta: [
      { title: "Browse Used Furniture — SuqBet" },
      {
        name: "description",
        content:
          "Search second-hand furniture by category, price, condition, material and city across Ethiopia.",
      },
      { property: "og:title", content: "Browse Used Furniture — SuqBet" },
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
  const { data: categories } = useQuery(categoriesQuery);
  const { data: listings, isLoading } = useQuery(
    listingsQuery({
      q: search.q || undefined,
      category: search.category || undefined,
      condition: search.condition || undefined,
      material: search.material || undefined,
      room: search.room || undefined,
      city: search.city || undefined,
      min: search.min,
      max: search.max,
      sort: search.sort,
    }),
  );

  const set = (patch: Partial<BrowseSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) });

  const activeCount = [
    search.q,
    search.category,
    search.condition,
    search.material,
    search.room,
    search.city,
  ].filter(Boolean).length + (search.min ? 1 : 0) + (search.max ? 1 : 0);

  const roots = (categories ?? []).filter((c) => !c.parent_id);
  const children = (categories ?? []).filter((c) => c.parent_id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Browse furniture</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isLoading ? "Loading…" : `${listings?.length ?? 0} items available`}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeCount > 0 ? (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-xs text-primary"
                onClick={() =>
                  navigate({
                    search: {
                      q: "",
                      category: "",
                      condition: "",
                      material: "",
                      room: "",
                      city: "",
                      min: 0,
                      max: 0,
                      sort: "newest",
                    },
                  })
                }
              >
                <X className="h-3 w-3" /> Clear ({activeCount})
              </button>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="q">Keyword</Label>
            <Input
              id="q"
              value={search.q}
              placeholder="e.g. sofa"
              onChange={(e) => set({ q: e.target.value })}
            />
          </div>

          <FilterSelect
            label="Category"
            value={search.category}
            onChange={(v) => set({ category: v })}
            options={[
              ...roots.map((c) => ({ value: c.slug, label: c.name })),
              ...children.map((c) => ({ value: c.slug, label: `— ${c.name}` })),
            ]}
          />
          <FilterSelect
            label="Condition"
            value={search.condition}
            onChange={(v) => set({ condition: v })}
            options={CONDITIONS.map((c) => ({ value: c, label: c }))}
          />
          <FilterSelect
            label="Material"
            value={search.material}
            onChange={(v) => set({ material: v })}
            options={MATERIALS.map((c) => ({ value: c, label: c }))}
          />
          <FilterSelect
            label="Room"
            value={search.room}
            onChange={(v) => set({ room: v })}
            options={ROOM_TYPES.map((c) => ({ value: c, label: c }))}
          />
          <FilterSelect
            label="City"
            value={search.city}
            onChange={(v) => set({ city: v })}
            options={CITIES.map((c) => ({ value: c, label: c }))}
          />

          <div className="space-y-2">
            <Label>Price range (ETB)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={search.min || ""}
                placeholder="Min"
                onChange={(e) => set({ min: Number(e.target.value) || 0 })}
              />
              <Input
                type="number"
                min={0}
                value={search.max || ""}
                placeholder="Max"
                onChange={(e) => set({ max: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </aside>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {roots.slice(0, 4).map((c) => (
                <Link
                  key={c.id}
                  to="/browse"
                  search={(prev) => ({ ...prev, category: c.slug })}
                  className="rounded-full border px-3 py-1 text-xs"
                >
                  {c.name}
                </Link>
              ))}
            </div>
            <Select value={search.sort} onValueChange={(v) => set({ sort: v })}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="price-asc">Price: low to high</SelectItem>
                <SelectItem value="price-desc">Price: high to low</SelectItem>
                <SelectItem value="viewed">Most viewed</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
              <p className="font-display text-lg">No items match those filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try widening your price range or clearing a filter.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link to="/sell">Post the first one</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
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
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder={`Any ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any {label.toLowerCase()}</SelectItem>
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
