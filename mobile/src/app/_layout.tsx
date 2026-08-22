import { useEffect, useRef } from "react";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { LangProvider, useLang } from "../lib/lang";
import { authFlow } from "../lib/authFlow";
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
    // Hold off while the password-reset flow is mid-flight on /auth — entering
    // the recovery code establishes a session, and kicking the user into the
    // app then would skip the new-password step.
    if (user && onAuthScreen && !authFlow.holdRedirect) {
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
/**
 * Auto-update: EAS OTA updates apply themselves instead of waiting for the
 * next cold start.
 *
 * expo-updates already checks automatically — `checkAutomatically: ON_LOAD`
 * in app.json maps to the native ALWAYS setting, so it checks on launch and
 * every time the app returns to the foreground — but a found update was only
 * downloaded and applied on the NEXT cold start. `useUpdates` reports the
 * result of that automatic check: when a new bundle is flagged we start the
 * download, and the moment it's staged (`isUpdatePending`) we reload so the
 * new version is live immediately. No user action needed; the app simply
 * restarts on the new code.
 *
 * The cooldown MUST be persisted, not held in a ref. `reloadAsync()` restarts
 * the JS runtime, so a `useRef` cooldown is reset by the very reload it was
 * meant to rate-limit: if the update was still reported pending after the
 * restart the app reloaded again, and again. Each reload remounts AuthProvider
 * with `loading: true, user: null`, which is what made the login screen flash
 * in and out — the "auth flicker" that appeared right after an OTA update.
 * AsyncStorage survives the reload, so the window is now honoured.
 *
 * Dev builds never auto-reload (`Updates.isEmbeddedLaunch` is irrelevant in
 * Expo Go; `__DEV__` is the reliable guard).
 */
const UPDATE_COOLDOWN_KEY = "lastUpdateApply";
const UPDATE_COOLDOWN_MS = 30 * 60 * 1000;

function useAutoUpdate() {
  const { isUpdatePending, isUpdateAvailable, isDownloading } = Updates.useUpdates();
  const applying = useRef(false);

  // The automatic check only flags availability — start the download.
  useEffect(() => {
    if (__DEV__) return;
    if (isUpdateAvailable && !isDownloading) {
      void Updates.fetchUpdateAsync().catch(() => {});
    }
  }, [isUpdateAvailable, isDownloading]);

  // Downloaded and staged: apply it, at most once per cooldown window.
  useEffect(() => {
    if (__DEV__ || !isUpdatePending || applying.current) return;
    applying.current = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(UPDATE_COOLDOWN_KEY);
        const last = raw ? Number(raw) : 0;
        if (Number.isFinite(last) && Date.now() - last < UPDATE_COOLDOWN_MS) {
          // Already reloaded recently — leave this bundle for the next launch
          // rather than risking a restart loop.
          return;
        }
        // Written BEFORE reloading: the reload kills this JS context, so
        // anything after it never runs.
        await AsyncStorage.setItem(UPDATE_COOLDOWN_KEY, String(Date.now()));
        await Updates.reloadAsync();
      } catch {
        applying.current = false;
      }
    })();
  }, [isUpdatePending]);
}

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
  useAutoUpdate();
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
      <Stack.Screen name="setup-profile" options={{ title: "", headerBackTitle: "Back" }} />
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
