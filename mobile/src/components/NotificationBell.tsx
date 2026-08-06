import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { useAsync } from "../hooks/use-async";
import { fetchNotifications } from "../lib/api";
import { subscribeNotifications } from "../lib/notifications";
import { colors } from "../lib/theme";

/**
 * Header bell with an unread badge, mirroring the web NotificationBell.
 * Updates live: a realtime INSERT refetches the unread count from anywhere in
 * the app (the root layout's banner still handles the foreground toast).
 */
export function NotificationBell() {
  const { user } = useAuth();
  const { data, refetch } = useAsync(
    () => fetchNotifications(user?.id ?? ""),
    [user?.id],
    !!user,
  );
  const unread = (data ?? []).filter((n) => !n.is_read).length;

  useEffect(() => {
    if (!user) return;
    return subscribeNotifications(user.id, () => refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return null;

  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push("/notifications")}
      hitSlop={8}
      accessibilityLabel="Notifications"
    >
      <Ionicons name="notifications-outline" size={22} color={colors.text} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
