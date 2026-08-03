import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Leaflet + OpenStreetMap location picker. No API key or billing needed.
 *
 * Leaflet ships its marker icons as separate image files resolved relative to
 * the CSS, which Vite's bundler rewrites — the default icon 404s. Building the
 * icon from the imported asset URLs is the standard workaround.
 */
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/** Addis Ababa — a sensible default view for an Ethiopian marketplace. */
const DEFAULT_CENTER: [number, number] = [9.03, 38.74];
const DEFAULT_ZOOM = 12;

export type Coords = { latitude: number; longitude: number };

function ClickHandler({ onPick }: { onPick: (c: Coords) => void }) {
  useMapEvents({
    click: (e) => onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng }),
  });
  return null;
}

/** Recentres the map when the value changes from outside (e.g. search result). */
function Recentre({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, Math.max(map.getZoom(), 15));
  }, [center, map]);
  return null;
}

export function LocationPicker({
  value,
  onChange,
  shopLocation,
}: {
  value: Coords | null;
  onChange: (c: Coords | null) => void;
  /** When set, offers a "use my shop location" shortcut. */
  shopLocation?: Coords | null;
}) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [recentre, setRecentre] = useState<[number, number] | null>(null);
  // react-leaflet's MapContainer is not SSR-safe; only mount it in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const center = useMemo<[number, number]>(
    () => (value ? [value.latitude, value.longitude] : DEFAULT_CENTER),
    // Only used for the initial view; Recentre handles later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Nominatim geocoding — free, but requires a descriptive UA and 1 req/sec. */
  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setNoResults(false);
    try {
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=et&q=" +
        encodeURIComponent(query);
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const results = (await res.json()) as { lat: string; lon: string }[];
      const hit = results[0];
      if (!hit) {
        setNoResults(true);
        return;
      }
      const picked = { latitude: Number(hit.lat), longitude: Number(hit.lon) };
      onChange(picked);
      setRecentre([picked.latitude, picked.longitude]);
    } catch {
      setNoResults(true);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("loc.searchPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Inside a <form>, Enter would submit the listing instead.
              e.preventDefault();
              void search();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void search()}>
          {searching ? t("loc.searching") : t("nav.browse")}
        </Button>
        {shopLocation ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onChange(shopLocation);
              setRecentre([shopLocation.latitude, shopLocation.longitude]);
            }}
          >
            {t("loc.useShop")}
          </Button>
        ) : null}
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t("loc.clear")}
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {noResults ? t("loc.noResults") : value ? t("loc.hint") : t("loc.none")}
      </p>

      <div className="h-64 overflow-hidden rounded-md border">
        {mounted ? (
          <MapContainer
            center={center}
            zoom={value ? 15 : DEFAULT_ZOOM}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickHandler onPick={onChange} />
            <Recentre center={recentre} />
            {value ? (
              <Marker
                position={[value.latitude, value.longitude]}
                icon={markerIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = (e.target as L.Marker).getLatLng();
                    onChange({ latitude: lat, longitude: lng });
                  },
                }}
              />
            ) : null}
          </MapContainer>
        ) : null}
      </div>

      {value ? (
        <p className="text-xs text-muted-foreground">
          {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}
