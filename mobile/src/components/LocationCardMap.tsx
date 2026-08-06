import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { useLang } from "../lib/lang";
import { useToast } from "./Toast";

/**
 * Read-only map for buyers, mirroring the web app's LocationCard: an embedded
 * map with a pin, a link to open it in Google Maps (which deep-links to the
 * native app when installed), and a copy-coordinates action.
 *
 * Uses the same OpenStreetMap embed iframe as the web card — no API key.
 */
export function LocationCardMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  /** Human-readable place, e.g. "Bole, Addis Ababa". */
  label: string;
}) {
  const { t } = useLang();
  const toast = useToast();

  // google.com/maps/search drops a pin at the coordinates and opens the native
  // app when installed — same link the web card uses.
  const pinUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  // The exact OSM embed URL the web LocationCard iframe uses.
  const bbox = [longitude - 0.006, latitude - 0.004, longitude + 0.006, latitude + 0.004]
    .map((n) => encodeURIComponent(String(n)))
    .join("%2C");
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;

  const copyCoords = async () => {
    try {
      await Clipboard.setStringAsync(`${latitude}, ${longitude}`);
      toast.success(t("coordinatesCopied"));
    } catch {
      toast.error(null, t("oops"));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="location" size={14} color={colors.primary} />
        <Text style={styles.headerText} numberOfLines={1}>
          {label}
        </Text>
      </View>

      <View style={styles.mapBox}>
        <WebView
          source={{ uri: embedUrl }}
          style={styles.map}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          // Only the embed itself may load — OSM attribution / "larger map"
          // links must not navigate the card away. Anything else opens in the
          // browser instead.
          onShouldStartLoadWithRequest={(req) =>
            req.url === embedUrl || req.url.startsWith("about:") || req.url.startsWith("data:")
          }
        />
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(directionsUrl)}>
          <Ionicons name="navigate-outline" size={15} color={colors.primary} />
          <Text style={styles.actionText}>{t("directions")}</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={copyCoords}>
          <Ionicons name="copy-outline" size={15} color={colors.primary} />
          <Text style={styles.actionText}>{t("copyCoordinates")}</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(pinUrl)}>
          <Ionicons name="map-outline" size={15} color={colors.primary} />
          <Text style={styles.actionText}>{t("openInMaps")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    ...shadows.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  headerText: { flex: 1, fontSize: 12.5, color: colors.textMuted, fontWeight: "600" },
  mapBox: { borderRadius: radius.md, overflow: "hidden" },
  map: { height: 180, width: "100%" },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingVertical: 9,
  },
  actionText: { fontSize: 11.5, color: colors.primary, fontWeight: "700" },
});
