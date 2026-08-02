import { Link } from "@tanstack/react-router";
import { Eye, MapPin, BadgeCheck } from "lucide-react";
import { ListingImage } from "@/components/ListingImage";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Badge } from "@/components/ui/badge";
import { formatBirr, timeAgo } from "@/lib/format";
import type { Listing } from "@/lib/marketplace";

export function ListingCard({ listing }: { listing: Listing }) {
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
            {listing.status !== "active" ? (
              <Badge variant="secondary" className="capitalize">
                {listing.status}
              </Badge>
            ) : null}
          </div>
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
                negotiable
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
            <span className="inline-flex items-center gap-1 truncate">
              {listing.profiles?.shop_name ?? listing.profiles?.full_name ?? "Seller"}
              {listing.profiles?.verified ? (
                <BadgeCheck className="h-3.5 w-3.5 text-success" aria-label="Verified seller" />
              ) : null}
            </span>
            <span>{timeAgo(listing.created_at)}</span>
          </div>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <FavoriteButton listingId={listing.id} />
      </div>
    </article>
  );
}
