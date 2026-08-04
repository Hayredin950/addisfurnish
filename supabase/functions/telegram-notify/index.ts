// telegram-notify — the Telegram twin of send-push.
//
// Everything Telegram-facing that isn't the bot webhook lives here, so the web
// app, the mobile app, admin actions and DB triggers all share one code path.
// (It used to live in web/src/lib/telegram.ts as TanStack server functions,
// which meant listings published from the mobile app never reached Telegram.)
//
// Three request shapes:
//
//   A. { notification_id, user_id, type, payload }
//      Sent by the `telegram_on_notification` DB trigger after every
//      notifications insert. Covers seller alerts (new_message,
//      callback_request), buyer alerts (price_drop, saved_search_match) and
//      verification decisions — one notify_user call now fans out to in-app,
//      push and Telegram.
//
//   B. { kind: "listing", listing_id }
//      Called by both apps right after a listing's images finish uploading.
//      Posts to the public channel and DMs buyers whose saved preferences
//      match. NOT a DB trigger: listing_images rows are inserted after the
//      listings row, so an AFTER INSERT trigger would always fire before the
//      cover photo exists and post a photo-less listing.
//
//   C. { kind: "view", listing_id }
//      "Your item is getting views" seller ping. Has no notifications row
//      behind it, so it can't ride shape A. Throttled to one per listing per
//      10 minutes.
//
// Deploy:
//   supabase functions deploy telegram-notify
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN
// Optional: TELEGRAM_CHANNEL_ID (channel posting), SITE_URL (links back)
// With TELEGRAM_BOT_TOKEN unset every path is a clean no-op.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const CHANNEL_ID = Deno.env.get("TELEGRAM_CHANNEL_ID");
const SITE_URL = Deno.env.get("SITE_URL") ?? "";

/** Buyer-broadcast caps. Exceeding these is logged, never silent. */
const MAX_PREFS_SCANNED = 500;
const MAX_BROADCAST_SENDS = 50;

type Lang = "en" | "am";

type NotifPayload = {
  title?: string;
  listingId?: string;
  query?: string | null;
  status?: string;
  reason?: string;
  oldPrice?: number | string;
  newPrice?: number | string;
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-ET", { maximumFractionDigits: 0 }).format(value) + " ETB";
}

function listingLink(listingId: string | undefined): string {
  if (!listingId || !SITE_URL) return "";
  return `\n\n${SITE_URL}/listing/${listingId}`;
}

async function sendMessage(chatId: string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // 4096 is Telegram's hard limit for a message body.
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Telegram copy per notification type, in the recipient's language.
 * Mirrors send-push's copyFor() so the three channels stay consistent.
 */
function copyFor(type: string, payload: NotifPayload, lang: Lang): string {
  const listing = payload.title ?? (lang === "am" ? "አንድ ዕቃ" : "a listing");
  const link = listingLink(payload.listingId);
  const en: Record<string, string> = {
    new_message: `💬 New message about “${listing}”`,
    callback_request: `📞 A buyer requested a callback about “${listing}”`,
    callback_response: `📞 Your callback request was updated: ${payload.status ?? "status changed"}`,
    listing_sold: `✅ “${listing}” has been marked sold`,
    price_drop: `📉 Price drop on “${listing}”${
      payload.newPrice != null ? ` — now ${formatPrice(Number(payload.newPrice))}` : ""
    }`,
    saved_search_match: `🔎 New match for “${payload.query ?? "your saved search"}”: ${listing}`,
    seller_verified: "✅ Your shop has been verified on AddisFurnish. Your badge is now live.",
    seller_rejected: `❌ Your verification was not approved${
      payload.reason ? `: ${payload.reason}` : "."
    } You can edit your details and resubmit.`,
    report_resolved: "Your report has been reviewed and acted on. Thank you.",
    report_dismissed: "Your report has been reviewed — no action was needed.",
  };
  const am: Record<string, string> = {
    new_message: `💬 ስለ “${listing}” አዲስ መልእክት ደርሷል`,
    callback_request: `📞 ስለ “${listing}” ገዢ ተመልሰው እንዲደውሉ ጠይቋል`,
    callback_response: `📞 የጥሪ ጥያቄዎ ተዘምኗል፦ ${payload.status ?? "ሁኔታው ተቀይሯል"}`,
    listing_sold: `✅ “${listing}” ተሽጧል ተብሎ ተመዝግቧል`,
    price_drop: `📉 “${listing}” ዋጋ ቀንሷል${
      payload.newPrice != null ? ` — አሁን ${formatPrice(Number(payload.newPrice))}` : ""
    }`,
    saved_search_match: `🔎 ለ“${payload.query ?? "የተቀመጠ ፍለጋዎ"}” አዲስ ውጤት፦ ${listing}`,
    seller_verified: "✅ ሱቅዎ በAddisFurnish ተረጋግጧል። የማረጋገጫ ምልክትዎ አሁን ይታያል።",
    seller_rejected: `❌ ማረጋገጫዎ አልጸደቀም${
      payload.reason ? `፦ ${payload.reason}` : "።"
    } መረጃዎን አስተካክለው እንደገና ማስገባት ይችላሉ።`,
    report_resolved: "ሪፖርትዎ ተገምግሞ እርምጃ ተወስዷል። እናመሰግናለን።",
    report_dismissed: "ሪፖርትዎ ተገምግሟል — እርምጃ አያስፈልግም ነበር።",
  };
  const table = lang === "am" ? am : en;
  return (table[type] ?? en[type] ?? `AddisFurnish: ${listing}`) + link;
}

// The generated `Database` types live in web/ and mobile/, not in this folder,
// so the service-role client is intentionally untyped — the same trade-off
// send-push makes. Every row this function reads is narrowed explicitly below.
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** Shape A — fan a notifications row out to the recipient's Telegram. */
async function handleNotification(
  supabase: SupabaseClient,
  body: { notification_id?: string; user_id?: string; type?: string; payload?: NotifPayload },
): Promise<Response> {
  const { notification_id: notificationId, user_id: userId } = body;
  if (!userId) return new Response("missing user_id", { status: 400 });
  // Required: the trigger authenticates with the project's anon key, which is
  // public by design. Same guard as send-push.
  if (!notificationId) return new Response("missing notification_id", { status: 400 });

  // Read type/payload from the row itself rather than trusting the request.
  // The trigger sends the same values, but a caller holding the public anon key
  // could otherwise pick their own message text for a notification id they own.
  const { data: notif } = await supabase
    .from("notifications")
    .select("id, type, payload")
    .eq("id", notificationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!notif) return new Response("notification not found", { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_chat_id, preferred_language")
    .eq("id", userId)
    .maybeSingle();
  const chatId = profile?.telegram_chat_id as string | null | undefined;
  if (!chatId) return new Response("not linked", { status: 200 });

  const lang: Lang = profile?.preferred_language === "am" ? "am" : "en";
  const type = (notif.type as string | null) ?? "";
  const payload = (notif.payload as NotifPayload | null) ?? {};
  await sendMessage(chatId, copyFor(type, payload, lang));
  return new Response("ok", { status: 200 });
}

type ListingRow = {
  id: string;
  title: string;
  price: number | string;
  category_id: string | null;
  city: string;
  negotiable: boolean;
  condition: string | null;
  seller_id: string;
  telegram_posted_at: string | null;
  listing_images?: { url: string; position: number }[];
  profiles?: { shop_name: string | null } | null;
  categories?: { name: string | null } | null;
};

/** Post a new listing to the public marketing channel. */
async function postToChannel(supabase: SupabaseClient, listing: ListingRow): Promise<boolean> {
  if (!CHANNEL_ID || !BOT_TOKEN) return false;
  if (listing.telegram_posted_at) return false; // already announced

  const link = SITE_URL ? `${SITE_URL}/listing/${listing.id}` : "";
  const extras = [listing.categories?.name, listing.condition, listing.city]
    .filter(Boolean)
    .join(" · ");
  const shop = listing.profiles?.shop_name ?? "AddisFurnish";
  // Build the body first, then rejoin — a literal "" blank-line separator would
  // be stripped by filter(Boolean), which is why the title used to run straight
  // into the price.
  const caption = [
    listing.title,
    [
      `${formatPrice(Number(listing.price))}${listing.negotiable ? " (negotiable)" : ""}`,
      extras ? `${extras} — ${shop}` : shop,
    ].join("\n"),
    link,
  ]
    .filter(Boolean)
    .join("\n\n");

  const cover = [...(listing.listing_images ?? [])].sort((a, b) => a.position - b.position)[0];
  const photoUrl = cover?.url?.startsWith("http")
    ? cover.url
    : cover?.url && SUPABASE_URL
      ? `${SUPABASE_URL}/storage/v1/object/public/listing-images/${cover.url}`
      : null;

  let sent = false;
  if (photoUrl) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // 1024 is Telegram's cap for a photo caption (vs 4096 for a message).
        body: JSON.stringify({
          chat_id: CHANNEL_ID,
          photo: photoUrl,
          caption: caption.slice(0, 1024),
        }),
      });
      sent = res.ok;
    } catch {
      sent = false;
    }
  }
  // No photo, or Telegram rejected it (bad URL, too large) — still announce.
  if (!sent) sent = await sendMessage(CHANNEL_ID, caption);

  if (sent) {
    await supabase
      .from("listings")
      .update({ telegram_posted_at: new Date().toISOString() })
      .eq("id", listing.id);
  }
  return sent;
}

type BuyerPrefRow = {
  user_id: string;
  category_ids: string[] | null;
  price_min: number | string | null;
  price_max: number | string | null;
  preferred_cities: string[] | null;
};

type LinkedProfileRow = {
  id: string;
  telegram_chat_id: string;
  preferred_language: string | null;
};

/**
 * Buyer bot: DM every linked user whose saved preferences match this listing.
 *
 * Deliberately independent of postToChannel — it used to run inside it, behind
 * two early returns, so matched buyers got nothing whenever the channel was
 * unconfigured or the listing had already been posted.
 */
async function broadcastToMatchedBuyers(
  supabase: SupabaseClient,
  listing: ListingRow,
): Promise<number> {
  if (!BOT_TOKEN) return 0;
  const { data: prefs } = await supabase
    .from("buyer_preferences")
    .select("user_id,category_ids,price_min,price_max,preferred_cities")
    .eq("telegram_alerts_enabled", true)
    .limit(MAX_PREFS_SCANNED);
  if (!prefs || prefs.length === 0) return 0;
  if (prefs.length === MAX_PREFS_SCANNED) {
    console.log(`broadcast: hit the ${MAX_PREFS_SCANNED}-row preference scan cap`);
  }

  const price = Number(listing.price);
  const matching = (prefs as BuyerPrefRow[]).filter((p) => {
    const categoryIds = p.category_ids ?? [];
    const cities = p.preferred_cities ?? [];
    if (categoryIds.length && !categoryIds.includes(listing.category_id ?? "")) return false;
    if (p.price_min != null && price < Number(p.price_min)) return false;
    if (p.price_max != null && price > Number(p.price_max)) return false;
    if (cities.length && !cities.includes(listing.city)) return false;
    return true;
  });
  if (matching.length === 0) return 0;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,telegram_chat_id,preferred_language")
    .in(
      "id",
      matching.map((m) => m.user_id),
    )
    .not("telegram_chat_id", "is", null);
  if (!profiles || profiles.length === 0) return 0;

  // Never DM the seller about their own listing.
  const recipients = (profiles as LinkedProfileRow[]).filter((p) => p.id !== listing.seller_id);
  const link = listingLink(listing.id);
  let sent = 0;
  for (const p of recipients) {
    if (sent >= MAX_BROADCAST_SENDS) {
      console.log(
        `broadcast: capped at ${MAX_BROADCAST_SENDS} sends, ${
          recipients.length - sent
        } matched buyer(s) not notified for listing ${listing.id}`,
      );
      break;
    }
    const text =
      p.preferred_language === "am"
        ? `🪑 አዲስ፦ ${listing.title} — ${formatPrice(price)}${link}`
        : `🪑 New: ${listing.title} — ${formatPrice(price)}${link}`;
    if (await sendMessage(p.telegram_chat_id, text)) sent += 1;
  }
  return sent;
}

/** Shape B — a listing was just published (images included). */
async function handleListing(
  supabase: SupabaseClient,
  listingId: string,
  callerId: string,
): Promise<Response> {
  const { data: listing } = await supabase
    .from("listings")
    .select(
      "id,title,price,category_id,negotiable,condition,city,seller_id,status,telegram_posted_at," +
        "listing_images(url,position),profiles(shop_name),categories(name)",
    )
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return new Response("listing not found", { status: 404 });
  // Only the seller may announce their own listing.
  if (listing.seller_id !== callerId) return new Response("forbidden", { status: 403 });
  if (listing.status !== "active") return new Response("not active", { status: 200 });

  const row = listing as unknown as ListingRow;
  // Isolated on purpose: the buyer broadcast used to run inside the channel
  // post, so any failure there silently cost matched buyers their alert.
  // Neither may prevent the other from running.
  const [posted, dmed] = await Promise.all([
    postToChannel(supabase, row).catch((e) => {
      console.error("channel post failed", e);
      return false;
    }),
    broadcastToMatchedBuyers(supabase, row).catch((e) => {
      console.error("buyer broadcast failed", e);
      return 0;
    }),
  ]);
  return Response.json({ ok: true, posted, dmed });
}

/** Shape C — throttled "your item is getting views" ping. */
async function handleView(
  supabase: SupabaseClient,
  listingId: string,
  viewerId: string,
): Promise<Response> {
  const { data: listing } = await supabase
    .from("listings")
    .select("id,title,seller_id,profiles(telegram_chat_id,preferred_language)")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return new Response("listing not found", { status: 404 });
  // Sellers browsing their own listing shouldn't ping themselves.
  if (listing.seller_id === viewerId) return new Response("own listing", { status: 200 });

  const seller = listing.profiles as {
    telegram_chat_id: string | null;
    preferred_language: string | null;
  } | null;
  if (!seller?.telegram_chat_id) return new Response("not linked", { status: 200 });

  // Throttle to at most one alert per listing per 10 minutes, so a listing on
  // the front page doesn't buzz the seller's phone continuously.
  //
  // The window must contain EXACTLY one recorded view: >1 means we already
  // alerted for this window, and 0 means the caller never recorded a view at
  // all — which an authenticated user could otherwise repeat indefinitely to
  // spam the seller, since `count > 1` alone treats 0 as "not throttled".
  // Callers must therefore await recordListingView() before pinging.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("listing_views")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId)
    .gte("created_at", since);
  if (count !== 1) return new Response("throttled", { status: 200 });

  const text =
    seller.preferred_language === "am"
      ? `👀 “${listing.title}” እየታየ ነው።${listingLink(listing.id as string)}`
      : `👀 Your item “${listing.title}” is getting views.${listingLink(listing.id as string)}`;
  await sendMessage(seller.telegram_chat_id, text);
  return new Response("ok", { status: 200 });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response("server misconfigured", { status: 500 });
  }
  // Nothing to deliver without a bot. Return 200 so callers treat an
  // unconfigured Telegram as success, not a failed publish.
  if (!BOT_TOKEN) return new Response("telegram not configured", { status: 200 });

  const body = await req.json().catch(() => null);
  if (!body) return new Response("bad request", { status: 400 });

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const kind = body.kind as string | undefined;

  // Shapes B and C are user-initiated, so they must carry a real user JWT —
  // the anon key that satisfies shape A must not be enough to reach them.
  if (kind === "listing" || kind === "view") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = await supabase.auth.getUser(jwt);
    const callerId = userData?.user?.id;
    if (!callerId) return new Response("unauthorized", { status: 401 });

    const listingId = body.listing_id as string | undefined;
    if (!listingId) return new Response("missing listing_id", { status: 400 });

    try {
      return kind === "listing"
        ? await handleListing(supabase, listingId, callerId)
        : await handleView(supabase, listingId, callerId);
    } catch (error) {
      // Telegram must never fail a publish — the listing is already live.
      console.error("telegram-notify failed", error);
      return new Response("ok", { status: 200 });
    }
  }

  try {
    return await handleNotification(supabase, body);
  } catch (error) {
    console.error("telegram-notify notification failed", error);
    return new Response("ok", { status: 200 });
  }
});
