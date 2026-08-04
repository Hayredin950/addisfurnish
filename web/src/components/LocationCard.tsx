import { useState } from "react";
import { Check, Copy, ExternalLink, MapPin, Navigation, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Read-only map for buyers, with copy / share / directions.
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
  const [copied, setCopied] = useState(false);

  const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  const bbox = [longitude - 0.006, latitude - 0.004, longitude + 0.006, latitude + 0.004]
    .map((n) => encodeURIComponent(String(n)))
    .join("%2C");
  const osmUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
  // `google.com/maps/dir/?api=1` opens turn-by-turn in the native app when
  // installed, and the web UI otherwise.
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coords);
      setCopied(true);
      toast.success(t("loc.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("toast.requestFailed"));
    }
  };

  const share = async () => {
    const text = `${title} — ${label}\n${coords}\n${osmUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: osmUrl });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
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
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t("loc.copy")}
        </Button>
        <Button variant="outline" size="sm" onClick={share}>
          <Share2 className="mr-1.5 h-3.5 w-3.5" />
          {t("loc.share")}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
            <Navigation className="mr-1.5 h-3.5 w-3.5" />
            {t("loc.directions")}
          </a>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={osmUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {t("loc.openInMaps")}
          </a>
        </Button>
      </div>

      <p className="px-3 pb-3 text-[11px] tabular-nums text-muted-foreground">{coords}</p>
    </div>
  );
}
