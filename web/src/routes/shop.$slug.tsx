import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, MapPin, Star, Flag, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  deleteReview,
  listingsQuery,
  reviewsQuery,
  shopQuery,
  submitReview,
} from "@/lib/marketplace";
import { isOnlineNow } from "@/lib/format";
import { ListingCard } from "@/components/ListingCard";
import { UserAvatar } from "@/components/UserAvatar";
import { Stars, StarPicker } from "@/components/ReviewStars";
import { ReportDialog } from "@/components/ReportDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/shop/$slug")({
  head: () => ({
    meta: [
      { title: "Furniture Shop — AddisFurnish" },
      { name: "description", content: "Browse every item this seller currently has for sale." },
      { property: "og:title", content: "Furniture Shop — AddisFurnish" },
      { property: "og:description", content: "A verified used-furniture shop on AddisFurnish." },
    ],
  }),
  component: Shop,
});

function Shop() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t, lang } = useLang();
  const { data: shop } = useQuery(shopQuery(slug));
  const { data: listings } = useQuery(listingsQuery({ sellerId: shop?.id ?? "none", limit: 60 }));
  const { data: reviews } = useQuery(reviewsQuery(shop?.id ?? ""));
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const postReview = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      await submitReview(shop!.id, user.id, rating, comment.trim());
    },
    onSuccess: () => {
      setRating(0);
      setComment("");
      toast.success(t("toast.reviewPosted"));
      queryClient.invalidateQueries({ queryKey: ["reviews", shop?.id] });
    },
    onError: (error: Error) =>
      error.message === "auth" ? navigate({ to: "/auth" }) : toast.error(t("toast.requestFailed")),
  });

  const removeReview = useMutation({
    mutationFn: async (reviewId: string) => {
      await deleteReview(reviewId);
    },
    onSuccess: () => {
      setRating(0);
      setComment("");
      toast.success(t("toast.reviewDeleted"));
      queryClient.invalidateQueries({ queryKey: ["reviews", shop?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!shop) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">{t("shop.notFound")}</h1>
      </div>
    );
  }

  const online = shop.is_online || isOnlineNow(shop.last_seen);
  const avg =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;
  const isSeller = shop.id === user?.id;
  const waLink = shop.whatsapp ? `https://wa.me/${shop.whatsapp.replace(/\D/g, "")}` : null;
  const tgLink = shop.telegram ? `https://t.me/${shop.telegram.replace(/^@/, "")}` : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-xl border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={shop.shop_name ?? shop.full_name}
              avatarUrl={shop.shop_logo_url ?? shop.avatar_url}
              size={56}
            />
            <h1 className="truncate font-display text-3xl font-semibold">
              {shop.shop_name ?? shop.full_name}
            </h1>
            {shop.verified ? <BadgeCheck className="h-5 w-5 shrink-0 text-primary" /> : null}
          </div>
          <div className="flex items-center gap-2">
            {reviews && reviews.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Stars value={avg} />
                <span className="text-xs text-muted-foreground">
                  {avg.toFixed(1)} · {t("shop.reviewCount", { count: reviews.length })}
                </span>
              </span>
            ) : null}
            <ReportDialog
              sellerId={shop.id}
              trigger={
                <Button variant="ghost" size="sm">
                  <Flag className="mr-1 h-3.5 w-3.5" />
                  {t("shop.report")}
                </Button>
              }
            />
          </div>
        </div>
        {shop.shop_description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{shop.shop_description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {shop.shop_address ?? shop.city ?? "Ethiopia"}
          </span>
          {online ? (
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {t("listing.onlineNow")}
            </span>
          ) : null}
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {t("listing.whatsapp")}
            </a>
          ) : null}
          {tgLink ? (
            <a
              href={tgLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {t("listing.telegram")}
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(listings ?? []).map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>

      <section className="mt-14 grid gap-8 lg:grid-cols-[1fr_360px]">
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
                      <span className="flex min-w-0 items-center gap-1.5">
                        <UserAvatar
                          name={r.profiles?.full_name}
                          avatarUrl={r.profiles?.avatar_url}
                          size={20}
                        />
                        <span className="truncate text-xs font-medium">
                          {r.profiles?.full_name ?? t("nav.profile")}
                        </span>
                      </span>
                      {mine ? (
                        <span className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              // Load the review into the form for editing; the
                              // upsert overwrites it on submit.
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

        {!isSeller ? (
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
    </div>
  );
}
