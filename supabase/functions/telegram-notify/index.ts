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
//      push and Telegram. Notification types that point at a listing render
//      as a rich photo card with a "View full listing" button; everything
//      else falls back to a plain text line.
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
//      behind it, so it can't ride shape A. Fires ONCE per view-count
//      milestone (10 / 50 / 100 / 500) via the listing_view_milestones table.
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

/** One-time view-count thresholds for the seller ping. */
const VIEW_MILESTONES = [10, 50, 100, 500];

type Lang = "en" | "am";

type NotifPayload = {
  title?: string;
  listingId?: string;
  query?: string | null;
  status?: string;
  reason?: string;
  oldPrice?: number | string;
  newPrice?: number | string;
  rating?: number | string;
  shopSlug?: string;
  price?: number | string;
  negotiable?: boolean;
  conversationId?: string;
  messagePreview?: string;
  senderName?: string;
};

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPrice(value: number | string | null | undefined): string {
  if (value == null) return "";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return new Intl.NumberFormat("en-ET", { maximumFractionDigits: 0 }).format(n) + " ETB";
}

function listingUrl(listingId: string | undefined): string {
  if (!listingId || !SITE_URL) return "";
  return `${SITE_URL}/listing/${listingId}`;
}

function listingLink(listingId: string | undefined): string {
  const url = listingUrl(listingId);
  return url ? `\n\n${url}` : "";
}

/** One tappable "View full listing" button under a listing card. */
function viewButton(listingId: string | undefined): Record<string, unknown>[] | undefined {
  const url = listingUrl(listingId);
  if (!url) return undefined;
  return [{ text: "View full listing", url }];
}

/** One tappable "Reply now" button under a new-message DM. */
function replyButton(): Record<string, unknown>[] | undefined {
  if (!SITE_URL) return undefined;
  return [{ text: "Reply now", url: `${SITE_URL}/messages` }];
}

/**
 * The shared HTML listing card. One visual identity across the channel post,
 * the preference-match DM and every listing-related notification: 🛋️ title,
 * 💰 price (with strikethrough original + red −% tag when discounted),
 * 🚚 delivery, 📍 room · condition · city, 🏪 shop, 🔗 button.
 */
function listingCardHtml(row: {
  title: string;
  price: number | string;
  original_price?: number | string | null;
  negotiable?: boolean;
  delivery_offered?: boolean;
  delivery_fee?: number | string | null;
  room_type?: string | null;
  condition?: string | null;
  city?: string | null;
  material?: string | null;
  color?: string | null;
  shop_name?: string | null;
  category?: string | null;
  discount_percent?: number | string | null;
}): string {
  const title = esc(row.title);
  const price = formatPrice(row.price);
  const hasDiscount =
    row.original_price != null && Number(row.original_price) > Number(row.price) &&
    row.discount_percent != null && Number(row.discount_percent) > 0;

  const priceLine = [
    `<b>${esc(price)}</b>`,
    hasDiscount ? `<s>${esc(formatPrice(row.original_price))}</s> <span class="tg-spoiler">−${esc(Number(row.discount_percent))}%</span>` : "",
    row.negotiable ? "<i>(negotiable)</i>" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const detailLine = [row.room_type, row.condition, row.city].filter(Boolean).join(" · ");
  const extras = [row.material, row.color].filter(Boolean).join(" · ");

  const lines: string[] = [`🛋️ <b>${title}</b>`, "", `💰 ${priceLine}`];
  if (detailLine) lines.push(`📍 ${esc(detailLine)}`);
  if (extras) lines.push(`🧵 ${esc(extras)}`);
  if (row.shop_name) lines.push(`🏪 ${esc(row.shop_name)}`);
  if (row.delivery_offered) {
    const fee = Number(row.delivery_fee);
    lines.push(fee > 0 ? `🚚 Delivery available · ${esc(formatPrice(fee))}` : "🚚 Free delivery");
  }
  if (row.category) lines.push(`🗂 ${esc(row.category)}`);
  return lines.join("\n");
}

async function sendMessage(chatId: string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // 4096 is Telegram's hard limit for a message body.
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),
        parse_mode: "HTML",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send a photo message (listing card) with an optional inline button.
 * Falls back to a plain text message when the photo URL is unusable, so a
 * broken image can never swallow the alert.
 */
async function sendCard(
  chatId: string,
  html: string,
  photoUrl: string | null,
  button?: Record<string, unknown>[] | undefined,
): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  const reply_markup = button ? { inline_keyboard: [button] } : undefined;
  if (photoUrl) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // 1024 is Telegram's cap for a photo caption (vs 4096 for a message).
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: html.slice(0, 1024),
          parse_mode: "HTML",
          reply_markup,
        }),
      });
      if (res.ok) return true;
    } catch {
      // fall through to the text message
    }
  }
  const url = button?.[0]?.url as string | undefined;
  const text = url ? `${html}\n\n🔗 ${url}` : html;
  return sendMessage(chatId, text);
}

/**
 * Telegram copy per notification type, in the recipient's language.
 * Mirrors send-push's copyFor() so the three channels stay consistent.
 * Used only for text-only notifications (no listing attached) — listing
 * notifications are rendered as cards by handleNotification instead.
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
    saved_search_match: `🔎 New match for “${payload.query ?? "your saved search"}”: ${listing}${
      payload.price != null
        ? ` — ${formatPrice(Number(payload.price))}${payload.negotiable ? " (negotiable)" : ""}`
        : ""
    }`,
    shop_reviewed: `⭐ New review on your shop${payload.rating != null ? ` — ${payload.rating}/5` : ""}${payload.title ? `: “${payload.title}”` : ""}`,
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
    saved_search_match: `🔎 ለ“${payload.query ?? "የተቀመጠ ፍለጋዎ"}” አዲስ ውጤት፦ ${listing}${
      payload.price != null
        ? ` — ${formatPrice(Number(payload.price))}${payload.negotiable ? " (negotiable)" : ""}`
        : ""
    }`,
    shop_reviewed: `⭐ በሱቅዎ ላይ አዲስ ግምገማ${payload.rating != null ? ` — ${payload.rating}/5` : ""}${payload.title ? `፦ “${payload.title}”` : ""}`,
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

/** Fields every listing-card consumer needs. */
type ListingRow = {
  id: string;
  title: string;
  price: number | string;
  original_price: number | string | null;
  discount_percent: number | string | null;
  negotiable: boolean;
  condition: string | null;
  city: string;
  category_id: string | null;
  room_type: string | null;
  material: string | null;
  color: string | null;
  delivery_offered: boolean;
  delivery_fee: number | string | null;
  seller_id: string;
  telegram_posted_at: string | null;
  listing_images?: { url: string; position: number }[];
  profiles?: { shop_name: string | null } | null;
  categories?: { name: string | null } | null;
};

const LISTING_SELECT =
  "id,title,price,original_price,discount_percent,negotiable,condition,city,category_id," +
  "room_type,material,color,delivery_offered,delivery_fee,seller_id,status,telegram_posted_at," +
  "listing_images(url,position),profiles(shop_name),categories(name)";

/** Best available cover-photo URL for a listing (storage passthrough). */
function coverUrl(listing: ListingRow, supabaseUrl?: string | null): string | null {
  const cover = [...(listing.listing_images ?? [])].sort((a, b) => a.position - b.position)[0];
  if (!cover?.url) return null;
  if (cover.url.startsWith("http")) return cover.url;
  return supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/listing-images/${cover.url}`
    : null;
}

/** Fetch a listing and its card fields for the notification DM. */
async function fetchListingCard(
  supabase: SupabaseClient,
  listingId: string,
): Promise<ListingRow | null> {
  const { data } = await supabase
    .from("listings")
    .select(LISTING_SELECT)
    .eq("id", listingId)
    .maybeSingle();
  return (data as ListingRow | null) ?? null;
}

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
    .select("telegram_chat_id, preferred_language, telegram_channel_joined_at")
    .eq("id", userId)
    .maybeSingle();
  const chatId = profile?.telegram_chat_id as string | null | undefined;
  if (!chatId) return new Response("not linked", { status: 200 });
  // Channel gate: when a channel is configured, alerts only flow after the
  // chat proved it joined (telegram-bot /join → verify). Backfilled for
  // pre-existing links, so only brand-new links are affected.
  if (CHANNEL_ID && !profile?.telegram_channel_joined_at) {
    return new Response("channel join pending", { status: 200 });
  }

  const lang: Lang = profile?.preferred_language === "am" ? "am" : "en";
  const type = (notif.type as string | null) ?? "";
  const payload = (notif.payload as NotifPayload | null) ?? {};

  // Listing-anchored notifications render as a photo card with a button.
  const listingId = payload.listingId;
  if (listingId) {
    const listing = await fetchListingCard(supabase, listingId);
    if (listing) {
      const html = listingCardHtml({
        title: listing.title,
        price: listing.price,
        original_price: listing.original_price,
        negotiable: listing.negotiable,
        delivery_offered: listing.delivery_offered,
        delivery_fee: listing.delivery_fee,
        room_type: listing.room_type,
        condition: listing.condition,
        city: listing.city,
        material: listing.material,
        color: listing.color,
        shop_name: listing.profiles?.shop_name ?? null,
        category: listing.categories?.name ?? null,
        discount_percent: listing.discount_percent,
      });

      let header = "";
      if (type === "new_message") {
        const preview = payload.messagePreview
          ? esc(payload.messagePreview).slice(0, 80) + (payload.messagePreview.length > 80 ? "…" : "")
          : "";
        const sender = payload.senderName ? esc(payload.senderName) : "Someone";
        header = `💬 <b>New message from ${sender}</b>${preview ? `\n\n“${preview}”` : ""}\n\n`;
      } else if (type === "callback_request") {
        header = `📞 <b>A buyer requested a callback</b>\n\n`;
      } else if (type === "price_drop") {
        const oldP = payload.oldPrice != null ? esc(formatPrice(payload.oldPrice)) : "";
        const newP = payload.newPrice != null ? esc(formatPrice(payload.newPrice)) : "";
        header = `🔻 <b>Price drop on a listing you saved</b>\n\n💰 ${oldP ? `<s>${oldP}</s> → ` : ""}<b>${newP}</b>\n\n`;
      } else if (type === "saved_search_match") {
        header = `🔔 <b>New match for your saved search</b>\n\n`;
      } else if (type === "shop_reviewed") {
        const stars = payload.rating != null ? "⭐".repeat(Math.max(1, Math.min(5, Number(payload.rating)))) : "⭐";
        header = `⭐ <b>New review on your shop</b> ${stars}${payload.rating != null ? ` (${esc(payload.rating)}/5)` : ""}\n\n`;
      }

      const photo = coverUrl(listing, SUPABASE_URL);
      await sendCard(chatId, header + html, photo, viewButton(listing.id));
      return new Response("ok", { status: 200 });
    }
  }

  // new_message without a listing still gets a "Reply now" button.
  if (type === "new_message" && payload.conversationId) {
    const preview = payload.messagePreview
      ? esc(payload.messagePreview).slice(0, 80) + (payload.messagePreview.length > 80 ? "…" : "")
      : "";
    const sender = payload.senderName ? esc(payload.senderName) : "Someone";
    const text = `💬 <b>New message from ${sender}</b>${preview ? `\n\n“${preview}”` : ""}`;
    await sendCard(chatId, text, null, replyButton());
    return new Response("ok", { status: 200 });
  }

  await sendMessage(chatId, copyFor(type, payload, lang));
  return new Response("ok", { status: 200 });
}

/** Post a new listing to the public marketing channel (rich card). */
async function postToChannel(supabase: SupabaseClient, listing: ListingRow): Promise<boolean> {
  if (!CHANNEL_ID || !BOT_TOKEN) return false;
  if (listing.telegram_posted_at) return false; // already announced

  const html = listingCardHtml({
    title: listing.title,
    price: listing.price,
    original_price: listing.original_price,
    negotiable: listing.negotiable,
    delivery_offered: listing.delivery_offered,
    delivery_fee: listing.delivery_fee,
    room_type: listing.room_type,
    condition: listing.condition,
    city: listing.city,
    material: listing.material,
    color: listing.color,
    shop_name: listing.profiles?.shop_name ?? null,
    category: listing.categories?.name ?? null,
    discount_percent: listing.discount_percent,
  });

  const photo = coverUrl(listing, SUPABASE_URL);
  const sent = await sendCard(CHANNEL_ID, html, photo, viewButton(listing.id));
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
  telegram_chat_id: string | null;
  telegram_channel_joined_at: string | null;
};

/**
 * Buyer broadcast: notify every user whose saved preferences match this
 * listing, across ALL channels — in-app centre, push and Telegram.
 *
 * It inserts a `saved_search_match` notifications row per matched buyer (the
 * same type the DB trigger uses for saved searches); the existing
 * push_on_notification / telegram_on_notification triggers then deliver push
 * and Telegram automatically. That keeps one code path for every channel and
 * is deliberately independent of postToChannel — it used to run inside it,
 * behind two early returns, so matched buyers got nothing whenever the channel
 * was unconfigured or the listing had already been posted.
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

  // Never notify the seller about their own listing.
  const recipients = matching.filter((m) => m.user_id !== listing.seller_id).slice(0, MAX_BROADCAST_SENDS);
  if (recipients.length === 0) return 0;

  const rows = recipients.map((m) => ({
    user_id: m.user_id,
    type: "saved_search_match",
    payload: {
      title: listing.title,
      listingId: listing.id,
      query: listing.categories?.name ?? null,
      price: price,
      negotiable: listing.negotiable,
    },
  }));
  const { data: inserted } = await supabase.from("notifications").insert(rows).select("user_id");
  return inserted?.length ?? 0;
}

/** Shape B — a listing was just published (images included). */
async function handleListing(
  supabase: SupabaseClient,
  listingId: string,
  callerId: string,
): Promise<Response> {
  const { data: listing } = await supabase
    .from("listings")
    .select(LISTING_SELECT)
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

/** Shape C — one-time view-milestone "your item is getting views" ping. */
async function handleView(
  supabase: SupabaseClient,
  listingId: string,
  viewerId: string,
): Promise<Response> {
  const { data: listing } = await supabase
    .from("listings")
    .select("id,title,seller_id,profiles(telegram_chat_id,preferred_language,telegram_channel_joined_at)")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return new Response("listing not found", { status: 404 });
  // Sellers browsing their own listing shouldn't ping themselves.
  if (listing.seller_id === viewerId) return new Response("own listing", { status: 200 });

  const seller = listing.profiles as {
    telegram_chat_id: string | null;
    preferred_language: string | null;
    telegram_channel_joined_at: string | null;
  } | null;
  if (!seller?.telegram_chat_id) return new Response("not linked", { status: 200 });
  // Same channel gate as notification delivery — alerts wait until the chat
  // proved it joined the marketing channel.
  if (CHANNEL_ID && !seller?.telegram_channel_joined_at) {
    return new Response("channel join pending", { status: 200 });
  }

  // Milestones, not a rolling throttle: a listing pings the seller at most
  // once per threshold (10/50/100/500 views), forever. The UNIQUE
  // (listing_id, threshold) constraint makes this race-safe across requests.
  const { count } = await supabase
    .from("listing_views")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId);

  let sent = 0;
  const total = count ?? 0;
  for (const threshold of VIEW_MILESTONES) {
    if (total < threshold) break; // thresholds are ascending
    const { error } = await supabase.from("listing_view_milestones").insert({
      listing_id: listingId,
      threshold,
    });
    // Unique-violation on an existing row is the normal "already fired" case.
    if (error) continue;

    const text =
      seller.preferred_language === "am"
        ? `📈 <b>“${esc(listing.title)}” ${esc(String(total))} እይታዎች ደርሷል!</b>${listingLink(listing.id as string)}`
        : `📈 <b>Your item is getting attention!</b>\n\n“${esc(listing.title)}” has reached <b>${esc(String(total))} views</b>.${listingLink(listing.id as string)}`;
    await sendMessage(seller.telegram_chat_id, text);
    sent += 1;
  }
  return Response.json({ ok: true, sent });
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
