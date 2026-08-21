import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Phone, PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { RequireAuth } from "@/components/RequireAuth";
import { listingsQuery, notifyUser, sellerViewsPerDayQuery } from "@/lib/marketplace";
import { syncListingChannel } from "@/lib/telegram";
import { formatBirr, STATUSES } from "@/lib/format";
import { ListingImage } from "@/components/ListingImage";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/dashboard")({
  // exactOptionalPropertyTypes: omit the key entirely when absent so plain
  // <Link to="/dashboard"> (no search) stays valid, like /sell and /profile.
  validateSearch: (search: Record<string, unknown>): { offer?: string } =>
    typeof search["offer"] === "string" && search["offer"] ? { offer: search["offer"] } : {},
  head: () => ({
    meta: [
      { title: "Seller Dashboard — AddisHome" },
      { name: "description", content: "Manage your listings, prices and callback requests." },
      { property: "og:title", content: "Seller Dashboard — AddisHome" },
      { property: "og:description", content: "Your AddisHome selling tools." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
});

const STATUS_LABEL: Record<
  string,
  "dash.statusActive" | "dash.statusReserved" | "dash.statusSold"
> = {
  active: "dash.statusActive",
  reserved: "dash.statusReserved",
  sold: "dash.statusSold",
};

const CALLBACK_STATUS_KEY: Record<
  string,
  "dash.cbStatusPending" | "dash.cbStatusContacted" | "dash.cbStatusClosed"
> = {
  pending: "dash.cbStatusPending",
  contacted: "dash.cbStatusContacted",
  closed: "dash.cbStatusClosed",
};

function Dashboard() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const { offer: offerParam } = Route.useSearch();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data: listings } = useQuery(listingsQuery({ sellerId: user?.id ?? "none", limit: 100 }));
  const { data: callbacks } = useQuery({
    queryKey: ["callbacks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("callback_requests")
        .select("id,phone,note,status,created_at,buyer_id,listings(title)")
        .eq("seller_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: viewsByDay } = useQuery(sellerViewsPerDayQuery(user?.id ?? "none"));
  const { data: conversations } = useQuery({
    queryKey: ["seller-conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: offers } = useQuery({
    queryKey: ["offers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select(
          "id,amount,message,status,created_at,buyer_id," +
            "listings(id,title),buyer:profiles!offers_buyer_id_fkey(full_name,phone)",
        )
        .eq("seller_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Offer-alert deep link (?offer=<id>): scroll the exact offer card into
  // view once the list has rendered, so the seller lands on the right row.
  useEffect(() => {
    if (!offerParam) return;
    const timer = setTimeout(() => {
      document
        .getElementById(`offer-${offerParam}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
    return () => clearTimeout(timer);
  }, [offerParam, offers]);

  const respondToOffer = async (o: {
    id: string;
    status: "accepted" | "declined";
    buyerId: string;
    listingTitle: string | undefined;
    listingId: string | undefined;
    amount: number;
  }) => {
    const { error } = await supabase
      .from("offers")
      .update({ status: o.status, updated_at: new Date().toISOString() })
      .eq("id", o.id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(o.status === "accepted" ? t("offer.acceptedToast") : t("offer.declinedToast"));
    queryClient.invalidateQueries({ queryKey: ["offers"] });
    if (o.buyerId) {
      // The offer's auto-message lives in the (listing, buyer) conversation —
      // the buyer's alert deep-links there so they see the reply in context.
      let conversationId: string | undefined;
      if (o.listingId) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("listing_id", o.listingId)
          .eq("buyer_id", o.buyerId)
          .maybeSingle();
        conversationId = (conv as { id: string } | null)?.id ?? undefined;
      }
      const payload: {
        status: string;
        title?: string;
        listingId?: string;
        amount: number;
        conversationId?: string;
      } = {
        status: o.status,
        amount: o.amount,
      };
      if (o.listingTitle) payload.title = o.listingTitle;
      if (o.listingId) payload.listingId = o.listingId;
      if (conversationId) payload.conversationId = conversationId;
      await notifyUser(o.buyerId, "offer_response", payload);
    }
  };

  const updateCallback = async (
    id: string,
    status: "contacted" | "closed",
    buyerId: string | null,
    listingTitle: string | undefined,
  ) => {
    const { error } = await supabase.from("callback_requests").update({ status }).eq("id", id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["callbacks"] });
    if (buyerId) {
      // Response-to-inquiry notification (spec §5).
      const payload: { status: string; title?: string } = { status };
      if (listingTitle) payload.title = listingTitle;
      await notifyUser(buyerId, "callback_response", payload);
    }
  };

  /**
   * Deletes a listing. `listings`, `listing_images` and `conversations` all
   * cascade from the listing row, so one delete is enough; the storage objects
   * are removed separately since Postgres has no reach into the bucket.
   */
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const listing = (listings ?? []).find((l) => l.id === pendingDelete.id);
      const paths = (listing?.listing_images ?? [])
        .map((img) => img.url)
        .filter((url): url is string => !!url && !url.startsWith("http"));

      // Retract the channel post BEFORE the row is deleted — the channel-post
      // record cascades off the listing, so afterwards there's no way to find it.
      syncListingChannel(pendingDelete.id, "delete");
      const { error } = await supabase.from("listings").delete().eq("id", pendingDelete.id);
      if (error) throw error;

      // Best-effort cleanup; orphaned files are harmless if this fails.
      if (paths.length) await supabase.storage.from("listing-images").remove(paths);

      toast.success(t("toast.listingDeleted"));
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const listing = (listings ?? []).find((l) => l.id === id);
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) {
      toast.error(t("toast.updateFailed"));
      return;
    }
    toast.success(t("toast.listingUpdated"));
    queryClient.invalidateQueries({ queryKey: ["listings"] });

    // Mark the channel post as sold (no-op if the listing was never posted).
    if (status === "sold") syncListingChannel(id);

    // Notify interested buyers when an item is marked sold.
    if (status === "sold" && listing) {
      const { data: buyers } = await supabase
        .from("conversations")
        .select("buyer_id")
        .eq("listing_id", id);
      for (const row of buyers ?? []) {
        await notifyUser(row.buyer_id, "listing_sold", {
          title: listing.title,
          listingId: id,
        });
      }
    }
  };

  const totalViews = (listings ?? []).reduce((sum, l) => sum + l.view_count, 0);

  const stats = [
    { label: t("dash.statsListings"), value: listings?.length ?? 0 },
    { label: t("dash.statsViews"), value: totalViews },
    { label: t("dash.statsCallbacks"), value: callbacks?.length ?? 0 },
    { label: t("dash.statsConversations"), value: conversations ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {profile?.shop_name ?? profile?.full_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dash.listingsCount", { count: listings?.length ?? 0, views: totalViews })}
          </p>
        </div>
        <Button asChild>
          <Link to="/sell">{t("nav.postItem")}</Link>
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-5 shadow-soft">
            <p className="font-display text-3xl font-semibold text-primary">{s.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{t("dash.viewsChart")}</h2>
          <span className="text-xs text-muted-foreground">{t("dash.lastDays", { days: 14 })}</span>
        </div>
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={viewsByDay ?? []} margin={{ left: -22, right: 4, top: 4 }}>
              <defs>
                <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 11 }}
                stroke="var(--border)"
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--border)" />
              <Tooltip
                formatter={(value) => [value, t("dash.statsViews")]}
                labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#viewsFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
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
                {formatBirr(listing.price)} · {t("dash.statsViews")}: {listing.view_count}
              </p>
            </div>
            <select
              value={listing.status}
              onChange={(e) => updateStatus(listing.id, e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm capitalize"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(STATUS_LABEL[s] ?? "dash.statusActive")}
                </option>
              ))}
            </select>
            <Button asChild variant="outline" size="sm">
              <Link to="/sell" search={{ edit: listing.id }}>
                {t("action.edit")}
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setPendingDelete({ id: listing.id, title: listing.title })}
            >
              {t("action.delete")}
            </Button>
          </div>
        ))}
        {listings?.length === 0 ? (
          <p className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            {t("dash.noListings")}
          </p>
        ) : null}
      </div>

      <h2 className="mt-12 font-display text-2xl font-semibold">{t("dash.callbacks")}</h2>
      <div className="mt-4 space-y-2">
        {(callbacks ?? []).map((c) => {
          const cb = c as unknown as {
            id: string;
            phone: string;
            note: string | null;
            status: string;
            buyer_id: string;
            created_at: string;
            listings: { title: string } | null;
          };
          return (
            <div key={cb.id} className="rounded-lg border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">
                  {cb.listings?.title ?? t("msg.listing")} — {cb.phone}
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${
                    cb.status === "pending"
                      ? "bg-amber-500/10 text-amber-600"
                      : cb.status === "contacted"
                        ? "bg-primary/10 text-primary"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {t(CALLBACK_STATUS_KEY[cb.status] ?? "dash.cbStatusPending")}
                </span>
              </div>
              {cb.note ? <p className="mt-1 text-muted-foreground">{cb.note}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(cb.created_at).toLocaleString()}
              </p>
              {cb.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      updateCallback(cb.id, "contacted", cb.buyer_id, cb.listings?.title)
                    }
                  >
                    <PhoneCall className="mr-1.5 h-3.5 w-3.5" /> {t("dash.markContacted")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateCallback(cb.id, "closed", cb.buyer_id, cb.listings?.title)}
                  >
                    <Phone className="mr-1.5 h-3.5 w-3.5" /> {t("dash.close")}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {callbacks?.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dash.noCallbacks")}</p>
        ) : null}
      </div>

      <h2 className="mt-12 font-display text-2xl font-semibold">{t("dash.offers")}</h2>
      <div className="mt-4 space-y-2">
        {(offers ?? []).map((o) => {
          const offer = o as unknown as {
            id: string;
            amount: number;
            message: string | null;
            status: string;
            buyer_id: string;
            created_at: string;
            listings: { id: string; title: string } | null;
            buyer: { full_name: string | null; phone: string | null } | null;
          };
          return (
            <div
              key={offer.id}
              id={`offer-${offer.id}`}
              className={`rounded-lg border bg-card p-4 text-sm transition-shadow ${
                offerParam === offer.id ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">
                  {offer.listings?.title ?? t("msg.listing")} —{" "}
                  <span className="text-primary">{formatBirr(offer.amount)}</span>
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${
                    offer.status === "pending"
                      ? "bg-amber-500/10 text-amber-600"
                      : offer.status === "accepted"
                        ? "bg-success/10 text-success"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {offer.status === "pending"
                    ? t("dash.offerStatusPending")
                    : offer.status === "accepted"
                      ? t("dash.offerStatusAccepted")
                      : offer.status === "declined"
                        ? t("dash.offerStatusDeclined")
                        : t("dash.offerStatusCancelled")}
                </span>
              </div>
              {offer.buyer ? (
                <p className="mt-1 text-muted-foreground">
                  {offer.buyer.full_name ?? ""}
                  {offer.buyer.phone ? ` · ${offer.buyer.phone}` : ""}
                </p>
              ) : null}
              {offer.message ? (
                <p className="mt-1 text-muted-foreground">“{offer.message}”</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(offer.created_at).toLocaleString()}
              </p>
              {offer.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      respondToOffer({
                        id: offer.id,
                        status: "accepted",
                        buyerId: offer.buyer_id,
                        listingTitle: offer.listings?.title,
                        listingId: offer.listings?.id,
                        amount: offer.amount,
                      })
                    }
                  >
                    {t("dash.acceptOffer")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      respondToOffer({
                        id: offer.id,
                        status: "declined",
                        buyerId: offer.buyer_id,
                        listingTitle: offer.listings?.title,
                        listingId: offer.listings?.id,
                        amount: offer.amount,
                      })
                    }
                  >
                    {t("dash.declineOffer")}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {offers?.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dash.noOffers")}</p>
        ) : null}
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("listing.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `“${pendingDelete.title}” — ` : null}
              {t("listing.deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open while the delete runs.
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("action.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
