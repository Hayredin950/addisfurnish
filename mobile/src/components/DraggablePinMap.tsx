import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../lib/theme";
import { useLang } from "../lib/lang";
import { useToast } from "./Toast";

export type Coords = { latitude: number; longitude: number };

/** Addis Ababa — a sensible default view for an Ethiopian marketplace. */
const DEFAULT_CENTER = { latitude: 9.03, longitude: 38.74 };
const DEFAULT_ZOOM = 13;

/**
 * Draggable-pin location picker — mirrors the web app's Leaflet LocationPicker.
 *
 * The web app renders its maps with Leaflet + OpenStreetMap, which needs no
 * API key. The mobile app does the same inside a WebView: the same Leaflet
 * setup, a draggable marker, and postMessage bridging so RN sees drag/tap
 * events and can move the pin from the GPS button or a search result.
 *
 * A pin is ALWAYS visible: it seeds from the initial value, or falls back to
 * the Addis Ababa default center, so the map never looks empty. `onChange` is
 * only fired for real user interaction (drag, tap, GPS, search) — the seeded
 * default pin does not silently claim a location.
 *
 * The WebView source is built ONCE (from the initial value) and kept stable —
 * every pin move afterwards goes through injectJavaScript, because changing
 * the `html` source would tear down and reload the map on each interaction.
 */
function mapHtml(initial: Coords | null): string {
  const center = initial
    ? [initial.latitude, initial.longitude]
    : [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude];
  const zoom = initial ? 15 : DEFAULT_ZOOM;
  const seedJs = initial
    ? `window.__place(${initial.latitude}, ${initial.longitude});`
    : `window.__seed(${DEFAULT_CENTER.latitude}, ${DEFAULT_CENTER.longitude});`;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; }
  .leaflet-container { background: #f3ebde; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map("map", { scrollWheelZoom: false }).setView([${center[0]}, ${center[1]}], ${zoom});
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var marker = null;

  function send() {
    if (!marker) return;
    var p = marker.getLatLng();
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ lat: p.lat, lng: p.lng }));
    }
  }

  function makeMarker(lat, lng) {
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on("dragend", send);
  }

  // Place (or move) the pin WITHOUT reporting — used for the seeded default so
  // an untouched map doesn't claim a location.
  window.__seed = function (lat, lng) {
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      makeMarker(lat, lng);
    }
  };

  // Place the pin and report the new coords.
  window.__place = function (lat, lng) {
    window.__seed(lat, lng);
    send();
  };

  // Place the pin, centre the map on it and report — for search results.
  window.__focus = function (lat, lng) {
    window.__seed(lat, lng);
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
    send();
  };

  // Tap anywhere drops/repositions the pin.
  map.on("click", function (e) {
    window.__place(e.latlng.lat, e.latlng.lng);
  });

  ${seedJs}
</script>
</body>
</html>`;
}

export function DraggablePinMap({
  value,
  onChange,
}: {
  value: Coords | null;
  onChange: (c: Coords | null) => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const webRef = useRef<WebView>(null);
  // The page (and its pin) is seeded from the value at first mount only.
  const initialValue = useRef(value).current;

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        toast.error(null, t("locationDenied"));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      onChange({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      toast.error(null, t("oops"));
    } finally {
      setLocating(false);
    }
  };

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
      if (loaded) {
        webRef.current?.injectJavaScript(
          `window.__focus(${picked.latitude}, ${picked.longitude}); true;`,
        );
      }
    } catch {
      setNoResults(true);
    } finally {
      setSearching(false);
    }
  };

  // Drive pin changes from RN (GPS, search, edits) without reloading the page.
  // Drags come back through postMessage, so injecting the same coords is a
  // harmless no-op. Clearing re-seeds the default pin (still visible).
  useEffect(() => {
    if (!loaded) return;
    if (value) {
      webRef.current?.injectJavaScript(
        `window.__place(${value.latitude}, ${value.longitude}); true;`,
      );
    } else {
      webRef.current?.injectJavaScript(
        `window.__seed(${DEFAULT_CENTER.latitude}, ${DEFAULT_CENTER.longitude}); true;`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, value?.latitude, value?.longitude]);

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t("mapSearchPlaceholder")}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={() => void search()}
          />
        </View>
        <Pressable style={styles.searchBtn} onPress={() => void search()} disabled={searching}>
          {searching ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={styles.searchBtnText}>{t("search")}</Text>
          )}
        </Pressable>
      </View>

      {noResults ? <Text style={styles.feedback}>{t("noResults")}</Text> : null}

      <View style={styles.mapBox}>
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          // Stable source — the map is built once and never reloaded.
          source={{ html: mapHtml(initialValue) }}
          style={styles.map}
          onLoadEnd={() => setLoaded(true)}
          onMessage={(e) => {
            try {
              const data = JSON.parse(e.nativeEvent.data) as { lat: number; lng: number };
              if (typeof data.lat === "number" && typeof data.lng === "number") {
                onChange({ latitude: data.lat, longitude: data.lng });
              }
            } catch {
              // ignore malformed messages from the page
            }
          }}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
        />
      </View>

      <View style={styles.row}>
        <Pressable style={styles.gpsBtn} onPress={useMyLocation} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="navigate" size={15} color={colors.primary} />
          )}
          <Text style={styles.gpsText}>{t("useCurrentLocation")}</Text>
        </Pressable>
        {value ? (
          <Pressable style={styles.clearBtn} onPress={() => onChange(null)}>
            <Text style={styles.clearText}>{t("clear")}</Text>
          </Pressable>
        ) : null}
      </View>

      {value ? (
        <Text style={styles.coords}>
          {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    backgroundColor: colors.background,
  },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: colors.text },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 76,
    alignItems: "center",
  },
  searchBtnText: { fontSize: 13, color: colors.onPrimary, fontWeight: "700" },
  feedback: { fontSize: 12, color: colors.danger },
  mapBox: { borderRadius: radius.lg, overflow: "hidden", position: "relative" },
  map: { height: 220, width: "100%", backgroundColor: "#f3ebde" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    flex: 1,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  gpsText: { fontSize: 13, color: colors.primary, fontWeight: "700" },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  clearText: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  coords: { fontSize: 12, color: colors.textMuted, fontFamily: "monospace" },
});
