import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  MapPin,
  Eye,
  Phone,
  ArrowLeft,
  Send,
  Truck,
  Timer,
  Star,
  Pencil,
  Trash2,
  Video,
  HandCoins,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { formatBirr, timeAgo, categoryName, isOnlineNow, formatEthiopianDate } from "@/lib/format";
import { pingListingView } from "@/lib/telegram";
import {
  deleteReview,
  listingQuery,
  listingsQuery,
  notifyUser,
  priceHistoryQuery,
  recordListingView,
  reviewsQuery,
  submitReview,
} from "@/lib/marketplace";
import { Stars, StarPicker } from "@/components/ReviewStars";
import { ListingGallery } from "@/components/ListingGallery";
import { useImageUrl } from "@/lib/storage";
import { UserAvatar } from "@/components/UserAvatar";
import { LocationCard } from "@/components/LocationCard";
import { ListingCard } from "@/components/ListingCard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ShareButton } from "@/components/ShareButton";
import { ReportDialog } from "@/components/ReportDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Find or create the buyer↔seller conversation for a listing (mobile parity). */
async function ensureConversation(
  listingId: string,
  buyerId: string,
  sellerId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await supabase
    .from("conversations")
    .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export const Route = createFileRoute("/listing/$id")({
  head: () => ({
    meta: [
      { title: "Furniture Listing — AddisHome" },
      {
        name: "description",
        content: "View photos, price history, condition details and contact the seller directly.",
      },
      { property: "og:title", content: "Furniture Listing — AddisHome" },
      { property: "og:description", content: "Second-hand furniture for sale in Ethiopia." },
    ],
  }),
  component: ListingDetail,
});

function ListingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t, lang } = useLang();
  const { data: listing, isLoading } = useQuery(listingQuery(id));
  const { data: history } = useQuery(priceHistoryQuery(id));
  const { data: reviews } = useQuery(reviewsQuery(listing?.seller_id ?? ""));
  const { data: videoUrl } = useImageUrl(listing?.video_url ?? null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const messageBoxRef = useRef<HTMLTextAreaElement>(null);
  const { data: similar } = useQuery(
    listingsQuery(
      listing?.categories?.slug ? { category: listing.categories.slug, limit: 4 } : { limit: 4 },
    ),
  );
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");

  // Refs let the view effect read the latest values without re-running (the
  // effect must run exactly once per page visit to avoid double counts).
  const viewerIdRef = useRef<string | null>(null);
  viewerIdRef.current = user?.id ?? null;
  const sellerIdRef = useRef<string | null>(null);
  sellerIdRef.current = listing?.seller_id ?? null;

  // Count the view and record it in recently-viewed (once per page visit).
  // Note: the RPC also writes recently_viewed when the caller is signed in, so
  // the effect deliberately depends only on the listing id to avoid double counts.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        // The view must be recorded before the ping: the edge function's
        // throttle reads listing_views, and a ping that arrives first sees an
        // empty window and would alert on every page load.
        void recordListingView(id).then(() => {
          if (sellerIdRef.current && sellerIdRef.current !== viewerIdRef.current) {
            pingListingView(id);
          }
        });
        queryClient.invalidateQueries({ queryKey: ["recently-viewed"] });
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, queryClient]);

  // Quick-view "Send a message" (?focus=message) → scroll to and focus the
  // message box once the listing (and the contact card) have rendered.
  const focus =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("focus") : null;
  useEffect(() => {
    if (focus !== "message" || !listing) return;
    const t = window.setTimeout(() => {
      messageBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      messageBoxRef.current?.focus();
    }, 250);
    return () => window.clearTimeout(t);
  }, [focus, listing]);

  const postReview = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      await submitReview(listing!.seller_id, user.id, rating, comment.trim());
    },
    onSuccess: () => {
      setRating(0);
      setComment("");
      toast.success(t("toast.reviewPosted"));
      queryClient.invalidateQueries({ queryKey: ["reviews", listing?.seller_id] });
    },
    onError: (error: Error) =>
      error.message === "auth"
        ? void navigate({ to: "/auth" })
        : toast.error(t("toast.requestFailed")),
  });

  const removeReview = useMutation({
    mutationFn: async (reviewId: string) => {
      await deleteReview(reviewId);
    },
    onSuccess: () => {
      setRating(0);
      setComment("");
      toast.success(t("toast.reviewDeleted"));
      queryClient.invalidateQueries({ queryKey: ["reviews", listing?.seller_id] });
    },
    onError: (error: Error) => toast.error(t("toast.requestFailed")),
  });

  const isOwnListing = !!user && !!listing && user.id === listing.seller_id;

  const contact = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      // A seller contacting their own listing would create a conversation with
      // themselves; the DB rejects it too, but fail early with a clear message.
      if (user.id === listing!.seller_id) throw new Error("self");
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
      await notifyUser(listing!.seller_id, "new_message", {
        title: listing!.title,
        listingId: listing!.id,
        conversationId,
        senderName:
          String((user!.user_metadata as Record<string, unknown>)?.["full_name"] ?? "") || "",
        messagePreview: message,
      });
    },
    onSuccess: () => {
      setMessage("");
      toast.success(t("toast.messageSent"));
      navigate({ to: "/messages" });
    },
    onError: (error: Error) => {
      if (error.message === "auth") {
        void navigate({ to: "/auth" });
      } else if (error.message === "self") {
        toast.error(t("toast.cannotMessageSelf"));
      } else {
        toast.error(t("toast.couldNotSend"));
      }
    },
  });

  const offer = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      if (user.id === listing!.seller_id) throw new Error("self");
      const amount = Number(offerAmount);
      if (!amount || amount <= 0) throw new Error("invalid");
      // Insert BEFORE notify: the offer row doubles as the notify_user thread
      // (same pattern as callback_requests — see the offers migration).
      const { data: offerRow, error } = await supabase
        .from("offers")
        .insert({
          listing_id: listing!.id,
          buyer_id: user.id,
          seller_id: listing!.seller_id,
          amount,
          message: offerMessage.trim() || null,
        })
        .select("id")
        .single();
      if (error || !offerRow) throw error;
      const { data: me } = await supabase
        .from("profiles")
        .select("full_name,phone")
        .eq("id", user.id)
        .maybeSingle();
      const buyerName = me?.full_name || "";
      const buyerPhone = me?.phone || "";
      // The conversation must exist before the notification: the offer's
      // auto-message lives there, and the seller's alert deep-links to it.
      const conversationId = await ensureConversation(listing!.id, user.id, listing!.seller_id);
      await notifyUser(listing!.seller_id, "offer_received", {
        title: listing!.title,
        listingId: listing!.id,
        offerId: offerRow.id,
        amount,
        buyerName,
        buyerId: user.id,
        conversationId,
        ...(buyerPhone ? { buyerPhone } : {}),
        ...(offerMessage.trim() ? { message: offerMessage.trim() } : {}),
      });
      // Mirror the offer into the chat with the amount + buyer contact.
      let msg = `💰 Offer — ${buyerName || "A buyer"} offers ${formatBirr(amount)} for "${listing!.title}".`;
      if (offerMessage.trim()) msg += `\nMessage: ${offerMessage.trim()}`;
      if (buyerPhone) msg += `\nContact: ${buyerPhone}`;
      const { error: msgErr } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: user.id, body: msg });
      if (msgErr) throw msgErr;
    },
    onSuccess: () => {
      setOfferOpen(false);
      setOfferAmount("");
      setOfferMessage("");
      toast.success(t("offer.sent"));
    },
    onError: (error: Error) => {
      if (error.message === "auth") {
        void navigate({ to: "/auth" });
      } else if (error.message === "self") {
        toast.error(t("offer.cantOfferSelf"));
      } else {
        toast.error(t("toast.requestFailed"));
      }
    },
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
      const buyerName = String(
        (user!.user_metadata as Record<string, unknown>)?.["full_name"] ?? "",
      );
      await notifyUser(listing!.seller_id, "callback_request", {
        title: listing!.title,
        listingId: listing!.id,
        phone,
        buyerId: user.id,
        ...(buyerName ? { buyerName } : {}),
        ...(message.trim() ? { note: message.trim() } : {}),
      });
      // Mirror the callback into the chat so the number lives with the
      // conversation, not just in alerts.
      const conversationId = await ensureConversation(listing!.id, user.id, listing!.seller_id);
      let cbMsg = `📞 Callback request — ${buyerName || "A buyer"} (${phone}) would like you to call them back about "${listing!.title}".`;
      if (message.trim()) cbMsg += `\nNote: ${message.trim()}`;
      const { error: cbErr } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: user.id, body: cbMsg });
      if (cbErr) throw cbErr;
    },
    onSuccess: () => {
      setPhone("");
      toast.success(t("toast.callbackSent"));
    },
    onError: (error: Error) =>
      error.message === "auth" ? navigate({ to: "/auth" }) : toast.error(t("toast.requestFailed")),
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
        <h1 className="font-display text-2xl font-semibold">{t("listing.notFoundTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("listing.notFoundBody")}</p>
        <Button asChild className="mt-6">
          <Link to="/browse">{t("listing.back")}</Link>
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
  const discountActive =
    listing.discount_expires_at && new Date(listing.discount_expires_at).getTime() > Date.now();
  const discountDays = discountActive
    ? Math.ceil((new Date(listing.discount_expires_at!).getTime() - Date.now()) / 86400000)
    : 0;
  const hasMap = typeof listing.latitude === "number" && typeof listing.longitude === "number";
  const online = seller ? seller.is_online || isOnlineNow(seller.last_seen) : false;
  const waLink = seller?.whatsapp
    ? `https://wa.me/${seller.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hi, I'm interested in "${listing.title}" on AddisHome`,
      )}`
    : null;
  const tgLink = seller?.telegram ? `https://t.me/${seller.telegram.replace(/^@/, "")}` : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/browse" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("listing.back")}
        </Link>
        <div className="flex items-center gap-2">
          <ShareButton />
          <ReportDialog
            listingId={listing.id}
            sellerId={listing.seller_id}
            trigger={
              <Button variant="ghost" size="sm">
                {t("listing.report")}
              </Button>
            }
          />
        </div>
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <ListingGallery images={images} alt={listing.title} />
          {listing.video_url ? (
            <div className="mt-4 overflow-hidden rounded-xl border bg-muted">
              <div className="flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold text-foreground">
                <Video className="h-3.5 w-3.5 text-primary" /> {t("video.showcase")}
              </div>
              <video
                src={videoUrl}
                controls
                preload="metadata"
                playsInline
                className="aspect-4/3 w-full bg-black object-contain"
              />
            </div>
          ) : null}

          <div className="mt-8">
            <h2 className="font-display text-xl font-semibold">{t("listing.description")}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {listing.description}
            </p>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 rounded-lg border bg-card p-5 text-sm sm:grid-cols-3">
            {[
              [t("listing.condition"), listing.condition],
              [t("listing.material"), listing.material],
              [t("listing.color"), listing.color],
              [t("listing.room"), listing.room_type],
              [t("listing.brand"), listing.brand],
              [t("listing.category"), categoryName(listing.categories, lang)],
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
              <h2 className="font-display text-lg font-semibold">{t("listing.priceHistory")}</h2>
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

        {/* `relative z-0 isolate` keeps the OSM embed iframe inside its own
            stacking context — without it the iframe can paint over the sticky
            navbar while scrolling. */}
        <aside className="relative z-0 isolate space-y-6">
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
              <Badge
                className={
                  listing.status === "sold"
                    ? "bg-muted text-muted-foreground"
                    : listing.status === "reserved"
                      ? "bg-amber-500/15 text-amber-700"
                      : "bg-success/10 text-success"
                }
              >
                {listing.status === "sold"
                  ? t("listing.statusSold")
                  : listing.status === "reserved"
                    ? t("listing.statusReserved")
                    : t("listing.statusAvailable")}
              </Badge>
            </div>
            {listing.negotiable ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("listing.negotiable")}</p>
            ) : null}
            {discountActive ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                <Timer className="h-3.5 w-3.5" />{" "}
                {t("listing.discountEnds", { days: discountDays })}
              </p>
            ) : null}
            {listing.delivery_offered ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Truck className="h-3.5 w-3.5" />
                {t("listing.deliveryAvailable", {
                  fee: listing.delivery_fee
                    ? formatBirr(listing.delivery_fee)
                    : t("listing.deliveryFree"),
                })}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">{t("listing.pickupOnly")}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {listing.sub_city ? `${listing.sub_city}, ` : ""}
                {listing.city}
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" /> {t("listing.views", { count: listing.view_count })}
              </span>
              <span>{t("listing.posted", { time: timeAgo(listing.created_at) })}</span>
              {lang === "am" ? (
                <span title="Ethiopian calendar">
                  {t("listing.listedOn", { date: formatEthiopianDate(listing.created_at, "am") })}
                </span>
              ) : null}
            </div>
          </div>

          {hasMap ? (
            <LocationCard
              latitude={listing.latitude!}
              longitude={listing.longitude!}
              label={`${listing.sub_city ? `${listing.sub_city}, ` : ""}${listing.city}`}
              title={listing.title}
            />
          ) : null}

          {seller ? (
            <div className="rounded-xl border bg-card p-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("listing.seller")}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <UserAvatar
                  name={seller.shop_name ?? seller.full_name}
                  avatarUrl={seller.shop_logo_url ?? seller.avatar_url}
                  size={44}
                />
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">
                    {seller.shop_name ?? seller.full_name}
                  </span>
                  {seller.verified ? (
                    <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                  ) : null}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {online ? (
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    {t("listing.onlineNow")}
                  </span>
                ) : (
                  <>
                    {seller.city ?? "Ethiopia"} ·{" "}
                    {t("listing.activeAgo", { time: timeAgo(seller.last_seen) })}
                  </>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {seller.shop_slug ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/shop/$slug" params={{ slug: seller.shop_slug }}>
                      {t("listing.visitShop")}
                    </Link>
                  </Button>
                ) : null}
                {waLink ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={waLink} target="_blank" rel="noopener noreferrer">
                      {t("listing.whatsapp")}
                    </a>
                  </Button>
                ) : null}
                {tgLink ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={tgLink} target="_blank" rel="noopener noreferrer">
                      {t("listing.telegram")}
                    </a>
                  </Button>
                ) : null}
                {seller.phone ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${seller.phone}`}>
                      <Phone className="mr-1.5 h-3.5 w-3.5" /> {t("listing.call")}
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {isOwnListing ? (
            <div className="rounded-xl border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">{t("listing.yourListing")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("listing.yourListingHint")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/sell" search={{ edit: listing.id }}>
                    {t("action.edit")}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/dashboard">{t("nav.myShop")}</Link>
                </Button>
              </div>
            </div>
          ) : (listing.status === "sold" || listing.status === "reserved" ? (
            <div className="rounded-xl border bg-card p-6 text-center">
              <p className="text-muted-foreground">
                {listing.status === "sold" ? t("listing.statusSold") : t("listing.statusReserved")} — {t("listing.noLongerAvailable")}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">{t("listing.contact")}</h2>
              <div className="mt-4 space-y-3">
                <Textarea
                  ref={messageBoxRef}
                  rows={3}
                  id="contact-message"
                  placeholder={t("listing.messagePlaceholder")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={!message.trim() || contact.isPending}
                  onClick={() => {
                    // Guests go to sign in first (mobile parity).
                    if (!user) {
                      void navigate({ to: "/auth" });
                      return;
                    }
                    contact.mutate();
                  }}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {t("listing.sendMessage")}
                </Button>
              </div>

              <div className="mt-6 space-y-2 border-t pt-5">
                <Label htmlFor="callback">{t("listing.callback")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="callback"
                    placeholder={t("listing.callbackPlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={!phone.trim() || callback.isPending}
                    onClick={() => {
                      // Guests go to sign in first (mobile parity).
                      if (!user) {
                        void navigate({ to: "/auth" });
                        return;
                      }
                      callback.mutate();
                    }}
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-5 border-t pt-5">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // Guests go to sign in first — the offer needs an account
                    // to be tracked and answered (mobile parity).
                    if (!user) {
                      void navigate({ to: "/auth" });
                      return;
                    }
                    setOfferOpen(true);
                  }}
                >
                  <HandCoins className="mr-2 h-4 w-4" /> {t("listing.makeOffer")}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">{t("listing.offerHint")}</p>
              </div>

              <p className="mt-5 text-xs text-muted-foreground">
                {t("listing.neverPay")}{" "}
                <Link to="/safety" className="text-primary">
                  {t("listing.safetyTips")}
                </Link>
              </p>
            </div>
          ))}

          <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("listing.makeOffer")}</DialogTitle>
                <DialogDescription>{t("listing.offerHint")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="offer-amount">{t("offer.amount")}</Label>
                  <Input
                    id="offer-amount"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="e.g. 12000"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offer-message">{t("offer.message")}</Label>
                  <Textarea
                    id="offer-message"
                    rows={2}
                    value={offerMessage}
                    onChange={(e) => setOfferMessage(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!Number(offerAmount) || Number(offerAmount) <= 0 || offer.isPending}
                  onClick={() => offer.mutate()}
                >
                  <HandCoins className="mr-2 h-4 w-4" /> {t("offer.submit")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </aside>
      </div>

      {/* Reviews — buyers can read and leave feedback right here, mirroring
          the shop page (the seller profile alone was too well hidden). */}
      <section className="mt-16 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border bg-card p-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Star className="h-5 w-5 text-primary" /> {t("shop.reviews")}
          </h2>
          {reviews && reviews.length > 0 ? (
            <ul className="mt-5 space-y-5">
              {reviews.map((r) => {
                const mine = !!user && r.author_id === user.id;
                return (
                  <li key={r.id} className="border-b pb-5 last:border-0">
                    <div className="flex items-center justify-between">
                      <Stars value={r.rating} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {r.comment ? (
                      <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>
                    ) : null}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">
                        {r.profiles?.full_name ?? t("nav.profile")}
                      </span>
                      {mine ? (
                        <span className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setRating(r.rating);
                              setComment(r.comment ?? "");
                            }}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            {t("action.edit")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            disabled={removeReview.isPending}
                            onClick={() => removeReview.mutate(r.id)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            {t("action.delete")}
                          </Button>
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">{t("shop.noReviews")}</p>
          )}
        </div>

        {!isOwnListing ? (
          <div className="h-fit rounded-xl border bg-card p-6">
            <h3 className="font-display text-lg font-semibold">{t("shop.writeReview")}</h3>
            {user ? (
              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (rating > 0 && comment.trim()) postReview.mutate();
                }}
              >
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("shop.yourRating")}
                  </p>
                  <StarPicker value={rating} onChange={setRating} />
                </div>
                <Textarea
                  rows={3}
                  placeholder={t("shop.commentPlaceholder")}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button
                  type="submit"
                  disabled={rating === 0 || !comment.trim() || postReview.isPending}
                >
                  {t("shop.submit")}
                </Button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                <Link to="/auth" className="text-primary">
                  {t("req.cta")}
                </Link>{" "}
                {t("req.body")}
              </p>
            )}
          </div>
        ) : null}
      </section>

      {similar && similar.length > 1 ? (
        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">{t("listing.similar")}</h2>
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
