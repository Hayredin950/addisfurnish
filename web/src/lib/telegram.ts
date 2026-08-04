import { createServerFn } from "@tanstack/react-start";

type PostResult = { ok: boolean; skipped?: boolean; url?: string; error?: string };

type LinkResult = { ok: boolean; skipped?: boolean; url?: string; error?: string };

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-ET", { maximumFractionDigits: 0 }).format(value) + " ETB";
}

/**
 * Posts a newly created listing to the public Telegram channel.
 *
 * Setup:
 *  1. Create a bot with @BotFather and add it as an admin to your channel.
 *  2. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID (e.g. "@suqbet_listings")
 *     as environment variables on the server.
 *  3. Set SITE_URL to the public app URL so channel posts link back to the listing.
 *
 * When the env vars are missing the call is a no-op (safe to leave unconfigured).
 */
export const postListingToTelegram = createServerFn({ method: "POST" })
  .validator((d: { listingId: string }) => d)
  .handler(async ({ data }): Promise<PostResult> => {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    const channel = process.env["TELEGRAM_CHANNEL_ID"];
    if (!token || !channel) return { ok: false, skipped: true };

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: listing } = await supabaseAdmin
        .from("listings")
        .select(
          "id,title,price,category_id,negotiable,condition,city,created_at,telegram_posted_at,listing_images(url,position),profiles(shop_name),categories(name,slug)",
        )
        .eq("id", data.listingId)
        .maybeSingle();

      if (!listing || listing.telegram_posted_at) return { ok: false, skipped: true };
      const siteUrl = process.env["SITE_URL"] ?? "";
      const link = `${siteUrl}/listing/${listing.id}`;
      const extras = [listing.categories?.name, listing.condition, listing.city]
        .filter(Boolean)
        .join(" · ");
      const caption = [
        listing.title,
        "",
        `${formatPrice(Number(listing.price))}${listing.negotiable ? " (negotiable)" : ""}`,
        extras
          ? `${extras} — ${listing.profiles?.shop_name ?? "AddisFurnish"}`
          : listing.profiles?.shop_name
            ? listing.profiles.shop_name
            : "",
        link ? `\n${link}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
      const cover = [...(listing.listing_images ?? [])].sort((a, b) => a.position - b.position)[0];

      const photoUrl = cover?.url?.startsWith("http")
        ? cover.url
        : cover?.url && supabaseUrl
          ? `${supabaseUrl}/storage/v1/object/public/listing-images/${cover.url}`
          : null;

      let sent = false;
      if (photoUrl) {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: channel,
            photo: photoUrl,
            caption: caption.slice(0, 1024),
          }),
        });
        sent = res.ok;
      }
      if (!sent) {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: channel, text: caption }),
        });
        sent = res.ok;
      }

      if (sent) {
        await supabaseAdmin
          .from("listings")
          .update({ telegram_posted_at: new Date().toISOString() })
          .eq("id", data.listingId);
      }
      // Buyer bot: notify linked users whose saved preferences match — runs
      // whenever the token is configured, independent of the channel post.
      await broadcastToMatchedFollowers(token, listing, siteUrl);
      return sent ? { ok: true } : { ok: false, error: "telegram api rejected the post" };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

type EventName = "message" | "callback" | "view";

async function sendTelegramText(token: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
  });
  return res.ok;
}

/**
 * Sends the seller a real-time Telegram alert (new message / callback
 * request). No-op when Telegram env vars are unset or the seller hasn't
 * linked their bot. Event text is hard-coded so sellers always understand it.
 */
export const notifySellerTelegram = createServerFn({ method: "POST" })
  .validator((d: { listingId: string; event: EventName }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) return { ok: false };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: listing } = await supabaseAdmin
        .from("listings")
        .select("id,title,price,profiles(telegram_chat_id)")
        .eq("id", data.listingId)
        .maybeSingle();
      const chatId = (listing?.profiles as { telegram_chat_id: string | null } | null)
        ?.telegram_chat_id;
      if (!listing || !chatId) return { ok: false };
      if (data.event === "view") {
        // Throttle view alerts: at most one per listing per 10-minute window,
        // so a popular listing doesn't spam the seller's phone.
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("listing_views")
          .select("id", { count: "exact", head: true })
          .eq("listing_id", data.listingId)
          .gte("created_at", since);
        if (count && count > 1) return { ok: false };
      }
      const siteUrl = process.env["SITE_URL"] ?? "";
      const link = `${siteUrl}/listing/${listing.id}`;
      const text =
        data.event === "callback"
          ? `📞 New callback request for “${listing.title}” (${Number(listing.price)} ETB)\n\n${link}`
          : data.event === "view"
            ? `👀 Your item “${listing.title}” is getting views.\n\n${link}`
            : `💬 New message about “${listing.title}” (${Number(listing.price)} ETB)\n\n${link}`;
      return { ok: await sendTelegramText(token, chatId, text) };
    } catch {
      return { ok: false };
    }
  });

/** Buyer-bot: send a filtered alert to every linked user whose saved
 *  preferences (category, price range, city) match the new listing. */
async function broadcastToMatchedFollowers(
  token: string,
  listing: {
    id: string;
    title: string;
    price: number | string;
    category_id: string | null;
    city: string;
  },
  siteUrl: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prefs } = await supabaseAdmin
      .from("buyer_preferences")
      .select("user_id,category_ids,price_min,price_max,preferred_cities,telegram_alerts_enabled")
      .eq("telegram_alerts_enabled", true)
      .limit(500);
    if (!prefs || prefs.length === 0) return;

    const price = Number(listing.price);
    const matching = prefs.filter((p) => {
      if (!p.telegram_alerts_enabled) return false;
      if (p.category_ids?.length && !p.category_ids.includes(listing.category_id ?? ""))
        return false;
      if (p.price_min != null && price < Number(p.price_min)) return false;
      if (p.price_max != null && price > Number(p.price_max)) return false;
      if (p.preferred_cities?.length && !p.preferred_cities.includes(listing.city)) return false;
      return true;
    });
    if (matching.length === 0) return;

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,telegram_chat_id")
      .in(
        "id",
        matching.map((m) => m.user_id),
      )
      .not("telegram_chat_id", "is", null);
    if (!profiles) return;

    const text = `🪑 New: ${listing.title} — ${formatPrice(price)}${siteUrl ? `\n\n${siteUrl}/listing/${listing.id}` : ""}`;
    let sent = 0;
    for (const p of profiles) {
      if (!p.telegram_chat_id || sent >= 50) break;
      if (await sendTelegramText(token, p.telegram_chat_id, text)) sent += 1;
    }
  } catch {
    // Broadcast is best-effort; channel post already succeeded.
  }
}

/**
 * Returns a `t.me/YourBot?start=TOKEN` deep link that links the user's Telegram
 * chat to their AddisFurnish account when they press start in the bot.
 * Requires TELEGRAM_BOT_USERNAME and TELEGRAM_BOT_TOKEN env vars.
 */
export const getTelegramDeepLink = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => d)
  .handler(async ({ data }): Promise<LinkResult> => {
    const username = process.env["TELEGRAM_BOT_USERNAME"];
    if (!username) return { ok: false, skipped: true };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("telegram_link_token")
        .eq("id", data.userId)
        .maybeSingle();
      let token = profile?.telegram_link_token;
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "");
        await supabaseAdmin
          .from("profiles")
          .update({ telegram_link_token: token })
          .eq("id", data.userId);
      }
      return { ok: true, url: `https://t.me/${username.replace(/^@/, "")}?start=${token}` };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
