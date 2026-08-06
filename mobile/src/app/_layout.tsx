import { useEffect, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { LangProvider, useLang } from "../lib/lang";
import { ToastProvider } from "../components/Toast";
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
    // Browsing is public, exactly like the web app: guests can see the home
    // feed, search, listings and shops without an account. Only the actions
    // that need identity (message, callback, favourite, review, report, sell)
    // send you to /auth, and each does that at its own call site.
    //
    // There is deliberately no signed-out redirect here. One used to bounce
    // every guest to /auth, which made the whole catalogue unreachable and gave
    // first-time users nothing to look at before signing up.
    if (user && onAuthScreen) {
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
    // `user` is memoized in AuthProvider but its shape could still change;
    // only the id matters for the subscription lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, lang]);
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
      <Stack.Screen name="dashboard" options={{ title: "", headerBackTitle: "Back" }} />
      <Stack.Screen name="admin" options={{ title: "", headerBackTitle: "Back" }} />
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
          <ToastProvider>
            <RootNavigator />
            <StatusBar style="dark" />
          </ToastProvider>
        </LangProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
