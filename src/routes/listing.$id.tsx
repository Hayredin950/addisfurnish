import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, MapPin, Eye, Phone, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatBirr, timeAgo } from "@/lib/format";
import { listingQuery, listingsQuery, priceHistoryQuery } from "@/lib/marketplace";
import { ListingImage } from "@/components/ListingImage";
import { ListingCard } from "@/components/ListingCard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/listing/$id")({
  head: () => ({
    meta: [
      { title: "Furniture Listing — SuqBet" },
      {
        name: "description",
        content: "View photos, price history, condition details and contact the seller directly.",
      },
      { property: "og:title", content: "Furniture Listing — SuqBet" },
      { property: "og:description", content: "Second-hand furniture for sale in Ethiopia." },
    ],
  }),
  component: ListingDetail,
});

function ListingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: listing, isLoading } = useQuery(listingQuery(id));
  const { data: history } = useQuery(priceHistoryQuery(id));
  const { data: similar } = useQuery(
    listingsQuery({ category: listing?.categories?.slug, limit: 4 }),
  );
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");

  const contact = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", id)
        .eq("buyer_id", user.id)
        .maybeSingle();
      let conversationId = existing?.id;
      if (!conversationId) {
        const { data, error } = await supabase
          .from("conversations")
          .insert({ listing_id: id, buyer_id: user.id, seller_id: listing!.seller_id })
          .select("id")
          .single();
        if (error) throw error;
        conversationId = data.id;
      }
      const { error: msgError } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: user.id, body: message });
      if (msgError) throw msgError;
    },
    onSuccess: () => {
      setMessage("");
      toast.success("Message sent");
      navigate({ to: "/messages" });
    },
    onError: (error: Error) =>
      error.message === "auth"
        ? navigate({ to: "/auth" })
        : toast.error("Could not send the message"),
  });

  const callback = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      const { error } = await supabase.from("callback_requests").insert({
        listing_id: id,
        buyer_id: user.id,
        seller_id: listing!.seller_id,
        phone,
        note: message || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setPhone("");
      toast.success("The seller will call you back");
    },
    onError: (error: Error) =>
      error.message === "auth" ? navigate({ to: "/auth" }) : toast.error("Request failed"),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="aspect-16/10 w-full rounded-xl" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Listing not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been sold and removed by the seller.
        </p>
        <Button asChild className="mt-6">
          <Link to="/browse">Back to browse</Link>
        </Button>
      </div>
    );
  }

  const images = [...listing.listing_images].sort((a, b) => a.position - b.position);
  const seller = listing.profiles;
  const drop =
    listing.original_price && Number(listing.original_price) > Number(listing.price)
      ? Math.round((1 - Number(listing.price) / Number(listing.original_price)) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/browse" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to browse
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-xl border bg-muted">
            <ListingImage
              path={images[active]?.url ?? null}
              alt={listing.title}
              className="aspect-4/3 w-full object-cover"
            />
          </div>
          {images.length > 1 ? (
            <div className="mt-3 flex gap-3">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`h-20 w-20 overflow-hidden rounded-md border ${
                    i === active ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <ListingImage
                    path={img.url}
                    alt={`${listing.title} photo ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-8">
            <h2 className="font-display text-xl font-semibold">Description</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {listing.description}
            </p>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 rounded-lg border bg-card p-5 text-sm sm:grid-cols-3">
            {[
              ["Condition", listing.condition],
              ["Material", listing.material],
              ["Colour", listing.color],
              ["Room", listing.room_type],
              ["Brand", listing.brand],
              ["Category", listing.categories?.name],
            ]
              .filter(([, v]) => !!v)
              .map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-medium capitalize">{value}</dd>
                </div>
              ))}
          </dl>

          {history && history.length > 1 ? (
            <div className="mt-8 rounded-lg border bg-card p-5">
              <h2 className="font-display text-lg font-semibold">Price history</h2>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {history.map((h, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{new Date(h.changed_at).toLocaleDateString()}</span>
                    <span className="font-medium text-foreground">{formatBirr(h.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border bg-card p-6 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-2xl font-semibold leading-snug">{listing.title}</h1>
              <FavoriteButton listingId={listing.id} />
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="font-display text-3xl font-semibold text-primary">
                {formatBirr(listing.price)}
              </span>
              {drop > 0 ? (
                <>
                  <span className="text-sm text-muted-foreground line-through">
                    {formatBirr(listing.original_price)}
                  </span>
                  <Badge variant="secondary">-{drop}%</Badge>
                </>
              ) : null}
            </div>
            {listing.negotiable ? (
              <p className="mt-1 text-xs text-muted-foreground">Price is negotiable</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {listing.sub_city ? `${listing.sub_city}, ` : ""}
                {listing.city}
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" /> {listing.view_count} views
              </span>
              <span>Posted {timeAgo(listing.created_at)}</span>
            </div>
          </div>

          {seller ? (
            <div className="rounded-xl border bg-card p-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Seller</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-medium">{seller.shop_name ?? seller.full_name}</span>
                {seller.verified ? <BadgeCheck className="h-4 w-4 text-primary" /> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {seller.city ?? "Ethiopia"} · active {timeAgo(seller.last_seen)}
              </p>
              {seller.shop_slug ? (
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link to="/shop/$slug" params={{ slug: seller.shop_slug }}>
                    Visit shop
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">Contact the seller</h2>
            <div className="mt-4 space-y-3">
              <Textarea
                rows={3}
                placeholder="Is this still available? Can I see it this weekend?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={!message.trim() || contact.isPending}
                onClick={() => contact.mutate()}
              >
                Send message
              </Button>
            </div>

            <div className="mt-6 space-y-2 border-t pt-5">
              <Label htmlFor="callback">Or request a callback</Label>
              <div className="flex gap-2">
                <Input
                  id="callback"
                  placeholder="09xx xxx xxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!phone.trim() || callback.isPending}
                  onClick={() => callback.mutate()}
                >
                  <Phone className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="mt-5 text-xs text-muted-foreground">
              Never pay before you see the item.{" "}
              <Link to="/safety" className="text-primary">
                Safety tips
              </Link>
            </p>
          </div>
        </aside>
      </div>

      {similar && similar.length > 1 ? (
        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">Similar items</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {similar
              .filter((s) => s.id !== listing.id)
              .slice(0, 4)
              .map((s) => (
                <ListingCard key={s.id} listing={s} />
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
