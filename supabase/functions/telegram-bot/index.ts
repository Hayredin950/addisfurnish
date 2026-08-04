// Telegram bot webhook — the Telegram side of account linking.
//
// Handles the t.me/<bot>?start=TOKEN deep link so a buyer's or seller's
// Telegram chat gets bound to their AddisFurnish account, plus /stop and
// /help. Once profiles.telegram_chat_id is set, the telegram-notify function
// delivers every alert.
//
// Deploy:
//   supabase functions deploy telegram-bot
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d "url=https://<project>.supabase.co/functions/v1/telegram-bot" \
//     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
//
// This function runs with verify_jwt = false (see supabase/config.toml) —
// Telegram's webhook POST carries no Authorization header, so Supabase must
// not demand one. That makes the endpoint public, which is why the
// secret_token check below is mandatory rather than optional: without it
// anyone could POST a forged /start and bind their own chat_id to someone
// else's account, silently redirecting all of that user's alerts.
//
// Required secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
//                   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SITE_URL = Deno.env.get("SITE_URL") ?? "";

type Lang = "en" | "am";

const COPY = {
  en: {
    linked: (shop: string) =>
      `✅ Connected to <b>${shop}</b>.\n\nYou'll get alerts here when someone messages you, requests a callback, or a listing matches your saved preferences.\n\nSend /stop any time to turn them off.`,
    invalid:
      "This link is invalid or has already been used. Open your AddisFurnish profile and tap “Connect Telegram” to get a fresh one.",
    expired:
      "This link has expired — they're valid for 15 minutes. Open your AddisFurnish profile and tap “Connect Telegram” for a new one.",
    noToken:
      "Hello! 👋 I send AddisFurnish alerts.\n\nTo connect, open your AddisFurnish profile and tap “Connect Telegram”.",
    stopped:
      "🔕 Disconnected. You won't get any more alerts here.\n\nReconnect any time from your AddisFurnish profile.",
    notLinked: "This chat isn't connected to an AddisFurnish account.",
    help: (site: string) =>
      `I deliver AddisFurnish alerts — new messages, callback requests, and listings matching your saved preferences.\n\n/start — connect your account\n/stop — stop alerts\n/help — this message${
        site ? `\n\n${site}` : ""
      }`,
    fallback: "I only send alerts. Use /help to see what I can do.",
  },
  am: {
    linked: (shop: string) =>
      `✅ ከ<b>${shop}</b> ጋር ተገናኝቷል።\n\nሰው ሲልክልዎ፣ ጥሪ ሲጠይቅ ወይም ከምርጫዎ ጋር የሚስማማ ዕቃ ሲወጣ እዚህ ማሳወቂያ ይደርስዎታል።\n\nለማቆም በማንኛውም ጊዜ /stop ይላኩ።`,
    invalid:
      "ይህ ሊንክ ዋጋ የለውም ወይም አስቀድሞ ተጠቅሟል። የAddisFurnish መገለጫዎን ከፍተው “ቴሌግራም አገናኝ” ይጫኑ።",
    expired:
      "የዚህ ሊንክ ጊዜ አልፎበታል — ለ15 ደቂቃ ብቻ ይሰራል። የAddisFurnish መገለጫዎን ከፍተው አዲስ ያግኙ።",
    noToken:
      "ሰላም! 👋 የAddisFurnish ማሳወቂያዎችን እልካለሁ።\n\nለማገናኘት የAddisFurnish መገለጫዎን ከፍተው “ቴሌግራም አገናኝ” ይጫኑ።",
    stopped: "🔕 ተቋርጧል። ከዚህ በኋላ ማሳወቂያ አይደርስዎትም።\n\nበማንኛውም ጊዜ ከመገለጫዎ እንደገና ማገናኘት ይችላሉ።",
    notLinked: "ይህ ውይይት ከAddisFurnish መለያ ጋር አልተገናኘም።",
    help: (site: string) =>
      `የAddisFurnish ማሳወቂያዎችን አደርሳለሁ — አዲስ መልእክቶች፣ የጥሪ ጥያቄዎች እና ከምርጫዎ ጋር የሚስማሙ ዕቃዎች።\n\n/start — መለያዎን ያገናኙ\n/stop — ማሳወቂያ ያቁሙ\n/help — ይህ መልእክት${
        site ? `\n\n${site}` : ""
      }`,
    fallback: "ማሳወቂያ ብቻ ነው የምልከው። /help ይጠቀሙ።",
  },
} as const;

async function sendMessage(chatId: number, text: string) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096), parse_mode: "HTML" }),
    });
  } catch {
    // Telegram unreachable — nothing useful to do inside a webhook.
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Authenticate Telegram itself. Without a configured secret we refuse to
  // serve at all rather than run as an open endpoint.
  if (!WEBHOOK_SECRET) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not set — refusing webhook requests");
    return new Response("not configured", { status: 500 });
  }
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const message = body?.message;
  if (!message || !SUPABASE_URL || !SERVICE_ROLE) {
    // Always 200 to Telegram — a non-2xx makes it retry the same update.
    return new Response("ok", { status: 200 });
  }

  const chatId = message.chat?.id as number | undefined;
  const text = (message.text ?? "").trim();
  if (!chatId) return new Response("ok", { status: 200 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Language follows the account when this chat is already linked.
  const { data: current } = await supabase
    .from("profiles")
    .select("id, preferred_language")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();
  const lang: Lang = current?.preferred_language === "am" ? "am" : "en";
  const copy = COPY[lang];

  if (text.startsWith("/start")) {
    const token = text.slice("/start".length).trim();
    if (!token) {
      await sendMessage(chatId, copy.noToken);
      return new Response("ok", { status: 200 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, shop_name, full_name, preferred_language, telegram_link_token_expires_at")
      .eq("telegram_link_token", token)
      .maybeSingle();

    if (!profile) {
      await sendMessage(chatId, copy.invalid);
      return new Response("ok", { status: 200 });
    }

    const expiresAt = profile.telegram_link_token_expires_at as string | null;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      await sendMessage(chatId, COPY[profile.preferred_language === "am" ? "am" : "en"].expired);
      return new Response("ok", { status: 200 });
    }

    // profiles.telegram_chat_id is UNIQUE, so a chat previously bound to
    // another account would make the update below fail. Detach it first —
    // re-linking a device to a new account is legitimate (shared phone,
    // account switch) and should just work.
    await supabase
      .from("profiles")
      .update({ telegram_chat_id: null, telegram_linked_at: null })
      .eq("telegram_chat_id", String(chatId))
      .neq("id", profile.id);

    const { error } = await supabase
      .from("profiles")
      .update({
        telegram_chat_id: String(chatId),
        telegram_linked_at: new Date().toISOString(),
        // Consume the token — single use.
        telegram_link_token: null,
        telegram_link_token_expires_at: null,
      })
      .eq("id", profile.id);

    const linkedCopy = COPY[profile.preferred_language === "am" ? "am" : "en"];
    if (error) {
      console.error("link failed", error);
      await sendMessage(chatId, linkedCopy.invalid);
      return new Response("ok", { status: 200 });
    }
    const name =
      (profile.shop_name as string | null) ??
      (profile.full_name as string | null) ??
      "AddisFurnish";
    await sendMessage(chatId, linkedCopy.linked(name));
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/stop")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    await supabase
      .from("profiles")
      .update({
        telegram_chat_id: null,
        telegram_linked_at: null,
        telegram_link_token: null,
        telegram_link_token_expires_at: null,
      })
      .eq("id", current.id);
    await sendMessage(chatId, copy.stopped);
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/help")) {
    await sendMessage(chatId, copy.help(SITE_URL));
    return new Response("ok", { status: 200 });
  }

  await sendMessage(chatId, copy.fallback);
  return new Response("ok", { status: 200 });
});
