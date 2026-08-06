import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../lib/theme";
import { useLang } from "../lib/lang";
import { useToast } from "./Toast";

export type Coords = { latitude: number; longitude: number };

/** Addis Ababa — a sensible default view for an Ethiopian marketplace. */
const DEFAULT_CENTER = { latitude: 9.03, longitude: 38.74 };
const DEFAULT_DELTA = 0.12;

/**
 * Draggable-pin location picker (mirrors the web app's Leaflet LocationPicker).
 *
 * Web has a full map with a draggable marker; this is the mobile equivalent
 * using react-native-maps. The user can drag the pin to fine-tune, or use the
 * GPS button to jump to where they actually are. On Android a Google Maps API
 * key is required (see app.json `android.config.googleMaps.apiKey`).
 */
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
  const mapRef = useRef<MapView>(null);

  const center = value
    ? { ...value, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { ...DEFAULT_CENTER, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA };

  // Only the GPS button recentres the map — dragging the pin must not animate
  // back to itself (visible "settle"). Dragging the marker, or tapping the
  // map, updates `value` and the marker simply moves with the map.
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
      const picked = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      onChange(picked);
      mapRef.current?.animateToRegion(
        { ...picked, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    } catch {
      toast.error(null, t("oops"));
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={center}
          onPress={(e) => onChange(e.nativeEvent.coordinate)}
        >
          {value ? (
            <Marker
              coordinate={value}
              draggable
              title={t("setLocation")}
              onDragEnd={(e) => onChange(e.nativeEvent.coordinate)}
            />
          ) : null}
        </MapView>

        {/* Crosshair hint when no pin is set yet: tapping the map drops one. */}
        {!value ? (
          <View style={styles.tapHint}>
            <Ionicons name="finger-print-outline" size={14} color={colors.onPrimary} />
            <Text style={styles.tapHintText}>{t("dragPinHint")}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.row}>
        <Pressable
          style={styles.gpsBtn}
          onPress={useMyLocation}
          disabled={locating}
        >
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
  map: { height: 220, width: "100%" },
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
