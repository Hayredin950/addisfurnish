import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "./supabase";
import { savePushToken, deletePushToken } from "./api";
import { translate } from "./i18n";
import type { Lang } from "./i18n";

let cachedToken: string | null = null;

/** Best-effort local notification (expo-notifications). No-op if unavailable. */
export async function showLocalNotification(title: string, body: string) {
  try {
    const Notifications = await import("expo-notifications");
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: "default" },
      trigger: null,
    });
  } catch {
    // expo-notifications not available (web) — silently ignore.
  }
}

/**
 * Realtime → local-notification bridge.
 * Subscribes to the realtime publication for `notifications` rows targeting
 * this user and raises a local notification while the app is foregrounded
 * (background delivery goes through Expo push — see registerForPushNotifications).
 */
let notifChannelSeq = 0;

/**
 * Subscribes to realtime INSERTs on `notifications` for this user.
 *
 * The channel topic is unique per call on purpose: supabase's RealtimeClient
 * reuses an existing channel instance when the topic already exists, and
 * adding a `postgres_changes` listener to an already-subscribed instance
 * throws ("cannot add postgres_changes callbacks after subscribe()"). Because
 * `removeChannel` is async, an effect re-run can re-subscribe before the old
 * channel is gone — a shared topic would then return that subscribed instance
 * and crash the app. Unique topics make every call a fresh channel.
 */
export function subscribeNotifications(userId: string, onNotify: (n: unknown) => void) {
  const topic = `notif-${userId}-${++notifChannelSeq}`;
  const channel = supabase
    .channel(topic)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNotify(payload.new);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ── Real push notifications (Expo Push Service) ───────────────────────────

/**
 * Request permission, create the Android channel and store this device's
 * ExpoPushToken in `push_tokens` so the `send-push` edge function can reach it.
 * Returns the token, or null if permission was denied / unsupported platform.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  try {
    const Notifications = await import("expo-notifications");
    if (!Notifications.getExpoPushTokenAsync) return null; // unsupported (web)

    const perms = await Notifications.getPermissionsAsync();
    const granted = perms.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#8A5A2B",
      });
    }

    // projectId only exists in EAS dev/production builds; in Expo Go the token
    // is automatically scoped to Expo Go's own project.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
    cachedToken = tokenData.data;

    await savePushToken(cachedToken, Platform.OS === "ios" ? "ios" : "android");
    return cachedToken;
  } catch (e) {
    console.warn("push registration failed", e);
    return null;
  }
}

/**
 * Human-friendly title/body for a notification row, shared by the in-app
 * center and the local banner (single source of truth per notification type).
 */
export function notificationText(
  lang: Lang,
  type: string,
  payload: {
    title?: string;
    query?: string | null;
    status?: string;
    reason?: string;
    rating?: number;
    shopSlug?: string;
    senderName?: string;
    messagePreview?: string;
  } | null,
): { title: string; body: string } {
  const p = payload ?? {};
  const listing = p.title ?? "";
  switch (type) {
    case "new_message":
      return {
        title: p.senderName || translate(lang, "appName"),
        body: p.messagePreview || (listing ? `Re: ${listing}` : ""),
      };
    case "callback_request":
      return { title: translate(lang, "requestCallback"), body: listing };
    case "callback_response":
      return { title: translate(lang, "callbackSent"), body: p.status ?? "" };
    case "listing_sold":
      return { title: translate(lang, "soldOut"), body: listing };
    case "price_drop":
      return { title: translate(lang, "discount"), body: listing };
    case "saved_search_match":
      return { title: translate(lang, "searchResults"), body: p.query ?? "" };
    case "shop_reviewed":
      return {
        title: translate(lang, "shopReviewed"),
        body:
          p.rating != null
            ? `${p.rating}/5${p.title ? ` — ${p.title}` : ""}`
            : (p.title ?? ""),
      };
    case "seller_verified":
      return { title: translate(lang, "shopVerified"), body: "" };
    case "seller_rejected":
      return { title: translate(lang, "docStatusRejected"), body: p.reason ?? "" };
    default:
      return { title: listing || translate(lang, "appName"), body: "" };
  }
}

/** Remove this device's token on sign-out so logged-out devices stop receiving pushes. */
export async function unregisterFromPush(): Promise<void> {
  if (!cachedToken) return;
  const token = cachedToken;
  cachedToken = null;
  try {
    await deletePushToken(token);
  } catch (e) {
    console.warn("push token delete failed", e);
  }
}

/**
 * Foreground presentation policy. Remote pushes are suppressed while the app
 * is open — the in-app realtime banner covers foreground UX — while locally
 * scheduled notifications still display. This avoids double banners and keeps
 * push for background / killed state.
 */
export function configurePushHandler() {
  void import("expo-notifications").then((Notifications) =>
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        // Remote (push) triggers carry type "push"; local ones are date/
        // timeInterval/etc. (the trigger union types are awkward, so narrow).
        const trigger = notification.request.trigger as { type?: string } | null;
        const isRemote = trigger?.type === "push";
        return {
          shouldShowBanner: !isRemote,
          shouldShowList: !isRemote,
          shouldPlaySound: !isRemote,
          shouldSetBadge: false,
        };
      },
    }),
  );
}

/** Deep-link handler for pushes tapped while the app is running. Returns a cleanup fn. */
export function addNotificationTapListener(
  onTap: (data: Record<string, unknown>) => void,
): () => void {
  let disposed = false;
  let sub: { remove: () => void } | null = null;
  void import("expo-notifications").then((Notifications) => {
    // If cleanup already ran (e.g. sign-out before the import resolved),
    // don't leak a listener that could navigate while signed out.
    if (disposed) return;
    sub = Notifications.addNotificationResponseReceivedListener((response) => {
      onTap((response.notification.request.content.data ?? {}) as Record<string, unknown>);
    });
  });
  return () => {
    disposed = true;
    sub?.remove();
  };
}

/** Cold-start handling: if the app was launched by tapping a push, return its data. */
export async function getLastNotificationTap(): Promise<Record<string, unknown> | null> {
  try {
    const Notifications = await import("expo-notifications");
    const resp = await Notifications.getLastNotificationResponseAsync();
    return (resp?.notification.request.content.data ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}
