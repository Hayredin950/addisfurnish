import { useEffect, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { LangProvider, useLang } from "../lib/lang";
import { colors } from "../lib/theme";
import {
  addNotificationTapListener,
  configurePushHandler,
  getLastNotificationTap,
  notificationText,
  registerForPushNotifications,
  showLocalNotification,
  subscribeNotifications,
  unregisterFromPush,
} from "../lib/notifications";

function useProtectedRoute() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onAuthScreen = segments[0] === "auth";
    // Only two redirects: signed-out users go to /auth; signed-in users leave
    // /auth. Stack screens (listing, shop, chat, notifications, sell) are open
    // to everyone and must NOT be redirected.
    if (!user && !onAuthScreen) {
      router.replace("/auth");
    } else if (user && onAuthScreen) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, segments]);
}

/**
 * Push lifecycle: register the device token when a user signs in, remove it on
 * sign-out, and deep-link to the listing/notifications when a push is tapped
 * (both while running and on cold start).
 */
function usePushNotifications() {
  const { user } = useAuth();
  const router = useRouter();
  // The same response can arrive via both the cold-start lookup and the live
  // listener — dedupe by notification id so we don't navigate twice.
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      void registerForPushNotifications(user.id);
    } else {
      void unregisterFromPush();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const route = (data: Record<string, unknown>) => {
      const key =
        typeof data.notificationId === "string" ? data.notificationId : JSON.stringify(data);
      if (lastHandled.current === key) return;
      lastHandled.current = key;
      if (typeof data.listingId === "string") {
        router.push(`/listing/${data.listingId}`);
      } else {
        router.push("/notifications");
      }
    };
    void getLastNotificationTap().then((d) => {
      if (d) route(d);
    });
    return addNotificationTapListener(route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}

/**
 * App-wide foreground banner: realtime INSERT → local notification, wherever
 * the user is. This is what the push handler's foreground suppression relies
 * on — with it scoped only to the notifications screen, foreground pushes
 * would otherwise be lost on every other screen.
 */
function useRealtimeBanner() {
  const { user } = useAuth();
  const { lang } = useLang();

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeNotifications(user.id, (n) => {
      const row = n as { type?: string; payload?: unknown } | null;
      if (!row) return;
      const { title, body } = notificationText(
        lang,
        row.type ?? "",
        (row.payload ?? null) as { title?: string } | null,
      );
      void showLocalNotification(title, body || title);
    });
    return unsub;
  }, [user, lang]);
}

function RootNavigator() {
  useProtectedRoute();
  usePushNotifications();
  useRealtimeBanner();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="listing/[id]" options={{ title: "", headerBackTitle: "Back" }} />
      <Stack.Screen name="shop/[slug]" options={{ title: "" }} />
      <Stack.Screen name="chat/[id]" options={{ title: "Chat", headerBackTitle: "Back" }} />
      <Stack.Screen name="notifications" options={{ title: "", headerBackTitle: "Back" }} />
      <Stack.Screen name="safety" options={{ title: "", headerBackTitle: "Back" }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    configurePushHandler();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LangProvider>
          <RootNavigator />
          <StatusBar style="dark" />
        </LangProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
