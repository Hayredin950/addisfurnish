// Client-side Telegram helpers.
//
// All Telegram delivery now lives in the `telegram-notify` edge function
// (supabase/functions/telegram-notify), shared with the mobile app — this
// module only kicks it off. Nothing here touches the bot token; the bot
// *username* is public (it's in the t.me link every user sees), so it's safe
// to read from a VITE_ var.
//
// Seller alerts for new messages and callback requests are NOT triggered here:
// they ride the `telegram_on_notification` DB trigger off the notifications
// row that notifyUser() already inserts.
import { supabase } from "@/integrations/supabase/client";

const BOT_USERNAME = (import.meta.env["VITE_TELEGRAM_BOT_USERNAME"] as string | undefined) ?? "";

/** Fire-and-forget: Telegram must never fail the user's action. */
async function invokeTelegram(body: Record<string, unknown>): Promise<void> {
  try {
    await supabase.functions.invoke("telegram-notify", { body });
  } catch (error) {
    console.warn("telegram-notify failed", error);
  }
}

/**
 * Announce a newly published listing: posts it to the public channel and DMs
 * matching buyers. Call this only after the listing's images have finished
 * uploading — the channel post uses the first image as its cover photo.
 */
export function announceListing(listingId: string): void {
  void invokeTelegram({ kind: "listing", listing_id: listingId });
}

/** Seller "your item is getting views" ping (throttled in the edge function). */
export function pingListingView(listingId: string): void {
  void invokeTelegram({ kind: "view", listing_id: listingId });
}

/**
 * Keep the public channel post in sync with the listing's real state.
 *
 * Call AFTER an edit (price drop, title, sold…) so the post's caption is
 * re-rendered (sold listings get a "✅ SOLD" header). For a hard delete, call
 * with action "delete" BEFORE deleting the listings row — the channel-post
 * record cascades off it, so there's no way to find the message afterwards.
 */
export function syncListingChannel(listingId: string, action: "auto" | "delete" = "auto"): void {
  void invokeTelegram({ kind: "sync_listing", listing_id: listingId, action });
}

/** True when a bot username is configured — gates the Connect UI. */
export function telegramConfigured(): boolean {
  return BOT_USERNAME.length > 0;
}

/**
 * Mints a single-use, 15-minute link token and returns the t.me deep link that
 * binds the user's Telegram chat to their account when they press Start.
 */
export async function getTelegramConnectUrl(): Promise<string | null> {
  if (!BOT_USERNAME) return null;
  const { data, error } = await supabase.rpc("mint_telegram_link_token");
  if (error || !data) return null;
  return `https://t.me/${BOT_USERNAME.replace(/^@/, "")}?start=${data}`;
}

/** Disconnects Telegram from the app side (the bot's /stop does the same). */
export async function disconnectTelegram(): Promise<boolean> {
  const { error } = await supabase.rpc("unlink_telegram");
  return !error;
}
