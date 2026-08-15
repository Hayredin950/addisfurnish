import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, MapPin, BadgeCheck } from "lucide-react";
import { ListingImage } from "@/components/ListingImage";
import { UserAvatar } from "@/components/UserAvatar";
import { FavoriteButton } from "@/components/FavoriteButton";
import { QuickViewDialog } from "@/components/QuickViewDialog";
import { Badge } from "@/components/ui/badge";
import { formatBirr, timeAgo } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import type { Listing } from "@/lib/marketplace";

export function ListingCard({ listing }: { listing: Listing }) {
  const { t } = useLang();
  const [quickView, setQuickView] = useState(false);
  const cover = [...(listing.listing_images ?? [])].sort((a, b) => a.position - b.position)[0];
  const discount =
    listing.original_price && Number(listing.original_price) > Number(listing.price)
      ? Math.round((1 - Number(listing.price) / Number(listing.original_price)) * 100)
      : null;

  return (
    <article className="card-lift group relative overflow-hidden rounded-lg border bg-card shadow-soft">
      <Link
        to="/listing/$id"
        params={{ id: listing.id }}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-4/3 overflow-hidden bg-secondary">
          <ListingImage
            path={cover?.url}
            alt={listing.title}
            className="h-full w-full transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute left-2 top-2 flex gap-1.5">
            {discount ? <Badge variant="destructive">-{discount}%</Badge> : null}
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
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQuickView(true);
            }}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-medium text-foreground opacity-100 shadow-soft backdrop-blur transition-opacity hover:bg-card md:opacity-0 md:group-hover:opacity-100"
          >
            <Eye className="h-3 w-3" /> Quick view
          </button>
        </div>
        <div className="space-y-2 p-3.5">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{listing.title}</h3>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-semibold text-primary">
              {formatBirr(listing.price)}
            </span>
            {discount ? (
              <span className="text-xs text-muted-foreground line-through">
                {formatBirr(listing.original_price!)}
              </span>
            ) : null}
            {listing.negotiable ? (
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("card.negotiable")}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {listing.sub_city ? `${listing.sub_city}, ` : ""}
              {listing.city}
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {listing.view_count}
            </span>
          </div>
          <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
              <UserAvatar
                name={listing.profiles?.shop_name ?? listing.profiles?.full_name}
                avatarUrl={listing.profiles?.shop_logo_url ?? listing.profiles?.avatar_url}
                size={20}
              />
              <span className="truncate">
                {listing.profiles?.shop_name ?? listing.profiles?.full_name ?? "Seller"}
              </span>
              {listing.profiles?.verified ? (
                <BadgeCheck
                  className="h-3.5 w-3.5 shrink-0 text-success"
                  aria-label={t("card.verified")}
                />
              ) : null}
            </span>
            <span className="shrink-0">{timeAgo(listing.created_at)}</span>
          </div>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <FavoriteButton listingId={listing.id} />
      </div>
      <QuickViewDialog listing={listing} open={quickView} onOpenChange={setQuickView} />
    </article>
  );
}
