import { Link } from "@tanstack/react-router";
import { Eye, MapPin } from "lucide-react";
import { ListingImage } from "@/components/ListingImage";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBirr } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import type { Listing } from "@/lib/marketplace";

/** Quick-look modal (spec §9): preview a listing without leaving the grid. */
export function QuickViewDialog({
  listing,
  open,
  onOpenChange,
}: {
  listing: Listing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLang();
  const cover = [...(listing.listing_images ?? [])].sort((a, b) => a.position - b.position)[0];
  const drop =
    listing.original_price && Number(listing.original_price) > Number(listing.price)
      ? Math.round((1 - Number(listing.price) / Number(listing.original_price)) * 100)
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="overflow-hidden rounded-md bg-muted">
          <ListingImage
            path={cover?.url}
            alt={listing.title}
            className="aspect-4/3 w-full object-cover"
          />
        </div>
        <DialogHeader className="text-left">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="font-display text-xl leading-snug">{listing.title}</DialogTitle>
            <FavoriteButton listingId={listing.id} />
          </div>
          <DialogDescription asChild>
            <div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold text-primary">
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
                {listing.negotiable ? (
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t("card.negotiable")}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {listing.sub_city ? `${listing.sub_city}, ` : ""}
                  {listing.city}
                </span>
                {listing.condition ? (
                  <span className="capitalize">
                    {t("listing.condition")}: {listing.condition}
                  </span>
                ) : null}
                <span>{t("listing.views", { count: listing.view_count })}</span>
              </div>
              {listing.description ? (
                <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                  {listing.description}
                </p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button asChild className="flex-1" onClick={() => onOpenChange(false)}>
            <Link to="/listing/$id" params={{ id: listing.id }}>
              <Eye className="mr-2 h-4 w-4" />
              {t("home.browseListings")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            <Link to="/listing/$id" params={{ id: listing.id }}>
              {t("listing.sendMessage")}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
