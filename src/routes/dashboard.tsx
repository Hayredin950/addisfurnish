import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { listingsQuery } from "@/lib/marketplace";
import { formatBirr, STATUSES } from "@/lib/format";
import { ListingImage } from "@/components/ListingImage";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Seller Dashboard — SuqBet" },
      { name: "description", content: "Manage your listings, prices and callback requests." },
      { property: "og:title", content: "Seller Dashboard — SuqBet" },
      { property: "og:description", content: "Your SuqBet selling tools." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
});

function Dashboard() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: listings } = useQuery(listingsQuery({ sellerId: user?.id ?? "none", limit: 100 }));
  const { data: callbacks } = useQuery({
    queryKey: ["callbacks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("callback_requests")
        .select("id,phone,note,status,created_at,listings(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) { toast.error("Update failed"); return; }
    toast.success("Listing updated");
    queryClient.invalidateQueries({ queryKey: ["listings"] });
  };

  const totalViews = (listings ?? []).reduce((sum, l) => sum + l.view_count, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {profile?.shop_name ?? profile?.full_name ?? "Your dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {listings?.length ?? 0} listings · {totalViews} total views
          </p>
        </div>
        <Button asChild>
          <Link to="/sell">Post an item</Link>
        </Button>
      </div>

      <div className="mt-8 space-y-3">
        {(listings ?? []).map((listing) => (
          <div key={listing.id} className="flex items-center gap-4 rounded-lg border bg-card p-3">
            <ListingImage
              path={listing.listing_images[0]?.url ?? null}
              alt={listing.title}
              className="h-16 w-16 rounded-md object-cover"
            />
            <div className="min-w-0 flex-1">
              <Link
                to="/listing/$id"
                params={{ id: listing.id }}
                className="block truncate font-medium"
              >
                {listing.title}
              </Link>
              <p className="text-xs text-muted-foreground">
                {formatBirr(listing.price)} · {listing.view_count} views
              </p>
            </div>
            <select
              value={listing.status}
              onChange={(e) => updateStatus(listing.id, e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm capitalize"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ))}
        {listings?.length === 0 ? (
          <p className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            You have not posted anything yet.
          </p>
        ) : null}
      </div>

      <h2 className="mt-12 font-display text-2xl font-semibold">Callback requests</h2>
      <div className="mt-4 space-y-2">
        {(callbacks ?? []).map((c) => (
          <div key={c.id} className="rounded-lg border bg-card p-4 text-sm">
            <p className="font-medium">
              {(c.listings as { title: string } | null)?.title ?? "Listing"} — {c.phone}
            </p>
            {c.note ? <p className="mt-1 text-muted-foreground">{c.note}</p> : null}
          </div>
        ))}
        {callbacks?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No callback requests yet.</p>
        ) : null}
      </div>
    </div>
  );
}
