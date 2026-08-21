import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { router } from "expo-router";

/**
 * Heart-toggle button for favouriting a listing.
 * Used on listing cards (browse grid) and the detail page.
 */
export function FavoriteButton({
  listingId,
  isFav,
  onToggle,
}: {
  listingId: string;
  isFav: boolean;
  onToggle: (listingId: string, isFav: boolean) => void;
}) {
  const { user } = useAuth();

  return (
    <Pressable
      hitSlop={12}
      onPress={() => {
        if (!user) {
          router.push("/auth");
          return;
        }
        onToggle(listingId, isFav);
      }}
      style={styles.btn}
    >
      <Ionicons
        name={isFav ? "heart" : "heart-outline"}
        size={20}
        color={isFav ? colors.danger : "#fff"}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});
