import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../lib/theme";
import { useLang } from "../lib/lang";
import { useToast } from "./Toast";

export type Coords = { latitude: number; longitude: number };

/** Addis Ababa — a sensible default view for an Ethiopian marketplace. */
const DEFAULT_CENTER = { latitude: 9.03, longitude: 38.74 };

/**
 * Draggable-pin location picker — mirrors the web app's Leaflet LocationPicker.
 *
 * The web app renders its maps with Leaflet + OpenStreetMap, which needs no
 * API key. The mobile app does the same inside a WebView: the same Leaflet
 * setup, a draggable marker, and postMessage bridging so RN sees drag/tap
 * events and can move the pin from the GPS button.
 *
 * The WebView source is built ONCE (from the initial value) and kept stable —
 * every pin move afterwards goes through injectJavaScript, because changing
 * the `html` source would tear down and reload the map on each interaction.
 */
function mapHtml(initial: Coords | null): string {
  const center = initial
    ? [initial.latitude, initial.longitude]
    : [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude];
  const zoom = initial ? 15 : 13;
  const pinJs = initial
    ? `window.__place(${initial.latitude}, ${initial.longitude});`
    : "";

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

  // Tap anywhere drops/repositions the pin.
  map.on("click", function (e) {
    window.__place(e.latlng.lat, e.latlng.lng);
  });

  window.__place = function (lat, lng) {
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      makeMarker(lat, lng);
    }
    send();
  };

  window.__clear = function () {
    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }
  };

  ${pinJs}
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

  // Drive pin changes from RN (GPS) without reloading the page. Drags come
  // back through postMessage, so injecting the same coords is a harmless no-op.
  useEffect(() => {
    if (!loaded) return;
    if (value) {
      webRef.current?.injectJavaScript(
        `window.__place(${value.latitude}, ${value.longitude}); true;`,
      );
    } else {
      webRef.current?.injectJavaScript("window.__clear(); true;");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, value?.latitude, value?.longitude]);

  return (
    <View style={styles.wrap}>
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
        {!value ? (
          <View style={styles.tapHint}>
            <Ionicons name="finger-print-outline" size={14} color={colors.onPrimary} />
            <Text style={styles.tapHintText}>{t("dragPinHint")}</Text>
          </View>
        ) : null}
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
  wrap: { gap: 10 },
  mapBox: { borderRadius: radius.lg, overflow: "hidden", position: "relative" },
  map: { height: 220, width: "100%", backgroundColor: "#f3ebde" },
  tapHint: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.overlay,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tapHintText: { color: "#fff", fontSize: 12, fontWeight: "600" },
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
