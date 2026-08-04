import { MapPin, Navigation, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Read-only map for buyers, with share and directions.
 *
 * Uses OpenStreetMap's embed iframe rather than Leaflet — no interaction is
 * needed here, and the iframe keeps the ~54 kB Leaflet bundle off pages that
 * only display a pin.
 */
export function LocationCard({
  latitude,
  longitude,
  label,
  title,
}: {
  latitude: number;
  longitude: number;
  /** Human-readable place, e.g. "Bole, Addis Ababa". */
  label: string;
  /** Listing title, used in the share sheet and iframe title. */
  title: string;
}) {
  const { t } = useLang();

  const bbox = [longitude - 0.006, latitude - 0.004, longitude + 0.006, latitude + 0.004]
    .map((n) => encodeURIComponent(String(n)))
    .join("%2C");
  // `google.com/maps/search/?api=1` drops a pin at the coordinates and opens the
  // native app when installed. Sharing raw coordinates is useless — a recipient
  // can't tap numbers — so every share carries this link instead.
  const pinUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  const share = async () => {
    // A tappable link, not coordinates: "<item> — <place>" then the map URL.
    const text = `${title} — ${label}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: pinUrl });
        return;
      } catch {
        /* user cancelled or the sheet failed — fall through to the clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${pinUrl}`);
      toast.success(t("loc.copied"));
    } catch {
      toast.error(t("toast.requestFailed"));
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 px-4 pt-4 text-xs font-medium text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>

      <iframe
        title={`Map — ${title}`}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`}
        className="mt-2 h-56 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />

      <div className="flex flex-wrap gap-2 p-3">
        <Button asChild variant="outline" size="sm">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
            <Navigation className="mr-1.5 h-3.5 w-3.5" />
            {t("loc.directions")}
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={share}>
          <Share2 className="mr-1.5 h-3.5 w-3.5" />
          {t("loc.share")}
        </Button>
      </div>
    </div>
  );
}
