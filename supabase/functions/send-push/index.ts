// send-push — forwards a notifications-row insert to Expo's push service.
//
// Invoked automatically by the `push_on_notification` DB trigger after every
// notifications insert (via supabase_functions.http_request), and can also be
// called directly with { user_id, type, payload } for manual/testing pushes.
//
// Deploy:
//   supabase functions deploy send-push
//
// Required secrets (auto-set for the platform, set explicitly if missing):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   EXPO_ACCESS_TOKEN — from expo.dev account settings; unauthenticated sends
//   still work in development but the token is required for higher rate limits
//   and in production it's strongly recommended.
//
// Testing a push from expo.dev: paste the device's ExpoPushToken into the
// project dashboard (expo.dev → your project → Notifications → Push tool).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN");

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const APP_NAME = "AddisFurnish";

type NotifPayload = {
  title?: string;
  listingId?: string;
  query?: string | null;
  status?: string;
  reason?: string;
};

/** Human-friendly title/body per notification type (mirrors the app). */
function copyFor(type: string, payload: NotifPayload): { title: string; body: string } {
  const listing = payload.title ?? "a listing";
  switch (type) {
    case "new_message":
      return { title: "New message", body: `New message about “${listing}”` };
    case "callback_request":
      return { title: "Callback request", body: `A buyer requested a callback about “${listing}”` };
    case "callback_response":
      return { title: "Callback update", body: payload.status ?? "Your callback status changed" };
    case "listing_sold":
      return { title: "Sold out", body: `“${listing}” has been sold` };
    case "price_drop":
      return { title: "Price drop", body: `The price dropped on “${listing}”` };
    case "saved_search_match":
      return {
        title: "New match",
        body: `New listings for “${payload.query ?? "your saved search"}”`,
      };
    case "seller_verified":
      return { title: "Shop verified", body: "Your shop is now verified — great work!" };
    case "seller_rejected":
      return {
        title: "Verification needs changes",
        body: payload.reason ?? "Your documents were not approved. Please resubmit.",
      };
    default:
      return { title: APP_NAME, body: listing };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response("server misconfigured", { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const userId = body?.user_id as string | undefined;
  const notificationId = body?.notification_id as string | undefined;
  if (!userId) return new Response("missing user_id", { status: 400 });
  // Required: the anon key is public, so this function must never accept a
  // push request that doesn't correspond to a real notification row — that
  // would let anyone spam any user's devices.
  if (!notificationId) return new Response("missing notification_id", { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Only forward rows that actually exist for this user (an anon-key caller
  // cannot fabricate notifications — the notify_user RPC guards inserts).
  const { data: notif } = await supabase
    .from("notifications")
    .select("id")
    .eq("id", notificationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!notif) return new Response("notification not found", { status: 404 });

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("id, token")
    .eq("user_id", userId);
  if (!tokens || tokens.length === 0) return new Response("no tokens", { status: 200 });

  const { title, body: text } = copyFor((body?.type as string) ?? "", body?.payload ?? {});
  const data: Record<string, string> = { type: (body?.type as string) ?? "" };
  data.notificationId = notificationId;
  if (body?.payload?.listingId) data.listingId = body.payload.listingId;

  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body: text,
    sound: "default",
    channelId: "default",
    data,
  }));

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;

  try {
    let res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });

    // 400/413: batch too large or a bad token poisons it — fall back to
    // sending each device individually. (Ticket pruning is skipped in this
    // path; the next insert will retry the healthy token.)
    if ((res.status === 400 || res.status === 413) && messages.length > 1) {
      for (const m of messages) {
        await fetch(EXPO_PUSH_ENDPOINT, { method: "POST", headers, body: JSON.stringify([m]) });
      }
      res = new Response("ok", { status: 200 });
    }

    // 503: Expo is overloaded — retry once with a short backoff.
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 1000));
      res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(messages),
      });
    }

    // Prune dead tokens reported in the response tickets.
    if (res.ok) {
      const tickets = (await res.json().catch(() => [])) as {
        status?: string;
        details?: { error?: string };
      }[];
      const dead = tokens.filter(
        (_t, i) =>
          tickets[i]?.status === "error" && tickets[i]?.details?.error === "DeviceNotRegistered",
      );
      if (dead.length > 0) {
        await supabase
          .from("push_tokens")
          .delete()
          .in(
            "id",
            dead.map((d) => d.id),
          );
      }
    }
  } catch {
    // expo.dev unreachable — never fail the caller; the in-app center still has it.
  }

  return new Response("ok", { status: 200 });
});
