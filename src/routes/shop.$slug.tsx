import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MapPin } from "lucide-react";
import { listingsQuery, shopQuery } from "@/lib/marketplace";
import { ListingCard } from "@/components/ListingCard";

export const Route = createFileRoute("/shop/$slug")({
  head: () => ({
    meta: [
      { title: "Furniture Shop — SuqBet" },
      { name: "description", content: "Browse every item this seller currently has for sale." },
      { property: "og:title", content: "Furniture Shop — SuqBet" },
      { property: "og:description", content: "A verified used-furniture shop on SuqBet." },
    ],
  }),
  component: Shop,
});

function Shop() {
  const { slug } = Route.useParams();
  const { data: shop } = useQuery(shopQuery(slug));
  const { data: listings } = useQuery(listingsQuery({ sellerId: shop?.id ?? "none", limit: 60 }));

  if (!shop) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Shop not found</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-xl border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl font-semibold">{shop.shop_name ?? shop.full_name}</h1>
          {shop.verified ? <BadgeCheck className="h-5 w-5 text-primary" /> : null}
        </div>
        {shop.shop_description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{shop.shop_description}</p>
        ) : null}
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {shop.shop_address ?? shop.city ?? "Ethiopia"}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(listings ?? []).map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}
