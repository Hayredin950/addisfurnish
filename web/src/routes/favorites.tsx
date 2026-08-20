import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { RequireAuth } from "@/components/RequireAuth";
import { ListingCard } from "@/components/ListingCard";
import type { Listing } from "@/lib/marketplace";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Saved Furniture — HabeshaHome" },
      { name: "description", content: "Every listing you saved, in one place." },
      { property: "og:title", content: "Saved Furniture — HabeshaHome" },
      { property: "og:description", content: "Your shortlist of second-hand furniture." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Favorites />
    </RequireAuth>
  ),
});

function Favorites() {
  const { user } = useAuth();
  const { t } = useLang();
  const { data } = useQuery({
    queryKey: ["favorites-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select(
          "listing_id, listings(*, listing_images(id,url,position), profiles!listings_seller_id_fkey(id,full_name,shop_name,shop_slug,shop_logo_url,avatar_url,verified,city,phone,last_seen), categories(name,slug))",
        )
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((row) => row.listings) as unknown as Listing[];
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{t("nav.savedItems")}</h1>
      {data && data.length > 0 ? (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {data.filter(Boolean).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-dashed p-16 text-center">
          <p className="font-display text-lg">{t("fav.emptyTitle")}</p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/browse">{t("fav.findSomething")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
