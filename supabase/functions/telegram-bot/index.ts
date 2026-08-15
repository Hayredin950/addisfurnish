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
// When set, new links must join this channel and verify before alerts flow.
// Accepts @username, a numeric chat id, or a t.me/joinchat/ invite link.
const CHANNEL_ID = Deno.env.get("TELEGRAM_CHANNEL_ID") ?? "";

// Mirrors mobile/src/lib/format.ts CITIES and web/src/lib/format.ts.
const CITIES = [
  "Addis Ababa",
  "Dire Dawa",
  "Hawassa",
  "Bahir Dar",
  "Mekelle",
  "Adama",
  "Gondar",
];
const CONDITIONS = ["New", "Used - Like New", "Used - Good", "Used - Fair"];
const MAX_SELL_PHOTOS = 4;

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
    joinAsk:
      "Almost done! 🎉\n\nTo start receiving alerts, please join our channel and tap the button below.",
    joinButton: "✅ I've joined — verify",
    joinNotFound: "I can't find that channel yet — tell the team to set TELEGRAM_CHANNEL_ID and try again.",
    joinVerified:
      "🎉 Verified! You're in.\n\nFrom now on I'll send you alerts here — new messages, callback requests, price drops and listings matching your preferences.",
    joinNotYet:
      "It doesn't look like you've joined yet. 😅\n\nOpen the channel link above, tap Join, then come back and press the button again.",
    joinFailed:
      "I couldn't verify your membership right now (Telegram may be busy). Try the button again in a minute.",
    alreadyVerified: "✅ You're already verified — alerts are active. Nothing to do!",
    stopped:
      "🔕 Disconnected. You won't get any more alerts here.\n\nReconnect any time from your AddisFurnish profile.",
    notLinked: "This chat isn't connected to an AddisFurnish account.",
    help: (site: string) =>
      `I deliver AddisFurnish alerts — new messages, callback requests, and listings matching your saved preferences.\n\n/start — connect your account\n/join — join our channel (required before alerts start)\n/find — browse the marketplace\n/saved — your saved items\n/mylistings — your active listings\n/inquiries — your messages\n/alerts — manage saved-search alerts\n/account — account summary\n/sell — create a draft listing from here\n/lang — switch language (English / አማርኛ)\n/stop — stop alerts\n/help — this message${
        site ? `\n\n${site}` : ""
      }`,
    fallback: "I only send alerts. Use /help to see what I can do.",
    // ── Phone verification ──
    shareAsk: (phone: string) =>
      `To verify <b>${phone}</b>, tap the button below to share your phone number.\n\nTelegram will send the number your account is registered with — it has to match the one you entered.`,
    shareButton: "📱 Share my phone number",
    shareNotOwn:
      "⚠️ That contact isn't yours.\n\nUse the <b>Share my phone number</b> button rather than forwarding a contact — I can only verify the number this Telegram account is registered with.",
    shareMismatch: (want: string) =>
      `⚠️ That's not the number you're verifying.\n\nYou asked to verify <b>${want}</b>, but this Telegram account is registered with a different number. Verify the number your Telegram uses, or start again with the right one.`,
    shareNoPending:
      "Start from your AddisFurnish profile — open “Verify phone” there and I'll take it from here.",
    codeSent: (code: string) =>
      `✅ Number confirmed.\n\nYour verification code is <b>${code}</b>\n\nType it on the AddisFurnish page you came from. It expires in 10 minutes.`,
    // ── Language ──
    langAsk: "Choose the language for this bot:\n\nቋንቋ ይምረጡ:",
    langSet: (l: string) => `✅ Language set to <b>${l}</b>.`,
    // ── Shortcut commands ──
    findIntro:
      "🔎 <b>Browse AddisFurnish</b> — sofas, beds, desks and more from shops across Ethiopia.",
    findButton: "🛒 Browse items",
    savedIntro:
      "❤️ <b>Your saved items</b> — tap below to open the items you've favorited.",
    savedButton: "Open saved items",
    myListingsIntro:
      "📦 <b>Your listings</b> — view and manage the items you've posted.",
    myListingsButton: "Open my dashboard",
    inquiriesIntro:
      "💬 <b>Your messages</b> — replies and inquiries about your items.",
    inquiriesButton: "Open messages",
    alertsIntro:
      "🔔 <b>Manage your alerts</b> — saved-search preferences and Telegram notification settings.",
    alertsButton: "Open alert settings",
    accountSummary: (name: string, city: string | null, isSeller: boolean, verified: boolean) =>
      `👤 <b>${name || "Your account"}</b>\n\n📍 ${city ?? "—"}\n${isSeller ? `🏪 Seller${verified ? " · ✅ verified" : ""}` : "🛍️ Buyer"}\n\nTap below to open your profile.`,
    accountButton: "👤 Open my profile",
    // ── Sell via Bot ──
    sellIntro:
      "🛍️ <b>Let's create a draft listing!</b>\n\nSend me up to 4 photos of the item (one per message), then tap Done.",
    sellPhotosGot: (n: number) =>
      `📷 ${n}/4 photos received — send more or tap <b>Done</b>.`,
    sellPhotosFull: "📷 4/4 photos received — tap <b>Done</b> to continue.",
    sellDonePhotos: "✅ Done with photos",
    sellCategory: "🏷️ Choose a category:",
    sellCondition: "📦 Condition?",
    sellPrice: "💰 Enter the price in ETB (numbers only, e.g. 8500).",
    sellCity: "📍 Which city?",
    sellInvalidPrice: "That doesn't look like a price. Send a number, e.g. 8500.",
    sellCreating: "⏳ Creating your draft…",
    sellDone: (title: string) =>
      `✅ <b>Draft created!</b>\n\n${title}\n\nTap below to finish the details (title, description, delivery…) and publish from the marketplace.`,
    sellFinishButton: "✏️ Finish in marketplace",
    sellCanceled: "🚫 Sell flow canceled. Send /sell to start again anytime.",
    sellCancel: "🚫 Cancel",
    sellTitlePrefix: "New listing — ",
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
    joinAsk:
      "ተይቶ ተጠናቋል! 🎉\n\nማሳወቂያ መቀበል ለመጀመር እባክዎ ቻናላችንን ይቀላቀሉ እና ከታች ያለውን ቁልፍ ይጫኑ።",
    joinButton: "✅ ተቀላቅያለሁ — አረጋግጥ",
    joinNotFound: "ቻናሉን ማግኘት አልቻልኩም — ቡድኑ TELEGRAM_CHANNEL_ID ን እንዲያዘጋጅ ንገሯቸው።",
    joinVerified:
      "🎉 ተረጋግጧል! እንኳን ደህና መጡ።\n\nከአሁን ጀምሮ ማሳወቂያዎችን እዚህ እልክልዎታለሁ — አዲስ መልእክቶች፣ የጥሪ ጥያቄዎች፣ የዋጋ ቅናሾች እና ከምርጫዎ ጋር የሚስማሙ ዕቃዎች።",
    joinNotYet:
      "እስካሁን የተቀላቀሉ አይመስሉም። 😅\n\nከላይ ያለውን ቻናል ይክፈቱ፣ Join ይጫኑ፣ ከዚያ ተመልሰው ቁልፉን ይጫኑ።",
    joinFailed:
      "አባልነትዎን ማረጋገጥ አልቻልኩም (ቴሌግራም ስራ ላይ ነው ሊሆን)። ከአንድ ደቂቃ በኋላ እንደገና ይሞክሩ።",
    alreadyVerified: "✅ አስቀድመው ተረጋግጠዋል — ማሳወቂያዎች ንቁ ናቸው። ምንም አይጠበቅም!",
    stopped: "🔕 ተቋርጧል። ከዚህ በኋላ ማሳወቂያ አይደርስዎትም።\n\nበማንኛውም ጊዜ ከመገለጫዎ እንደገና ማገናኘት ይችላሉ።",
    notLinked: "ይህ ውይይት ከAddisFurnish መለያ ጋር አልተገናኘም።",
    help: (site: string) =>
      `የAddisFurnish ማሳወቂያዎችን አደርሳለሁ — አዲስ መልእክቶች፣ የጥሪ ጥያቄዎች እና ከምርጫዎ ጋር የሚስማሙ ዕቃዎች።\n\n/start — መለያዎን ያገናኙ\n/join — ቻናላችንን ይቀላቀሉ (ማሳወቂያ ከመጀመሩ በፊት ያስፈልጋል)\n/find — ገበያውን ያስሱ\n/saved — የተቀመጡ እቃዎችዎ\n/mylistings — ንቁ ማስታወቂያዎችዎ\n/inquiries — መልእክቶችዎ\n/alerts — የተቀመጡ ፍለጋዎችን ያስተዳድሩ\n/account — የመለያ ማጠቃለያ\n/sell — ከዚህ የረቂቅ ማስታወቂያ ይፍጠሩ\n/lang — ቋንቋ ይቀይሩ (English / አማርኛ)\n/stop — ማሳወቂያ ያቁሙ\n/help — ይህ መልእክት${
        site ? `\n\n${site}` : ""
      }`,
    fallback: "ማሳወቂያ ብቻ ነው የምልከው። /help ይጠቀሙ።",
    // ── Phone verification ──
    shareAsk: (phone: string) =>
      `<b>${phone}</b>ን ለማረጋገጥ ከታች ያለውን ቁልፍ ተጭነው ስልክ ቁጥርዎን ያጋሩ።\n\nቴሌግራም መለያዎ የተመዘገበበትን ቁጥር ይልካል — ካስገቡት ጋር መመሳሰል አለበት።`,
    shareButton: "📱 ስልክ ቁጥሬን አጋራ",
    shareNotOwn:
      "⚠️ ያ አድራሻ የእርስዎ አይደለም።\n\nእባክዎ የ<b>ስልክ ቁጥሬን አጋራ</b> ቁልፍ ይጠቀሙ — ማረጋገጥ የምችለው ይህ የቴሌግራም መለያ የተመዘገበበትን ቁጥር ብቻ ነው።",
    shareMismatch: (want: string) =>
      `⚠️ የሚያረጋግጡት ቁጥር አይደለም።\n\n<b>${want}</b>ን ለማረጋገጥ ጠይቀዋል፣ ግን ይህ የቴሌግራም መለያ በሌላ ቁጥር ተመዝግቧል። ቴሌግራምዎ የሚጠቀመውን ቁጥር ያረጋግጡ።`,
    shareNoPending: "ከAddisFurnish መገለጫዎ ይጀምሩ — “ስልክ አረጋግጥ” የሚለውን ይክፈቱ።",
    codeSent: (code: string) =>
      `✅ ቁጥሩ ተረጋግጧል።\n\nየማረጋገጫ ኮድዎ <b>${code}</b> ነው\n\nመጥተውበት ባለው የAddisFurnish ገጽ ላይ ያስገቡት። በ10 ደቂቃ ውስጥ ያልፋል።`,
    // ── Language ──
    langAsk: "ለዚህ ቦት ቋንቋ ይምረጡ:\n\nChoose the language for this bot:",
    langSet: (l: string) => `✅ ቋንቋ ወደ <b>${l}</b> ተቀይሯል።`,
    // ── Shortcut commands ──
    findIntro:
      "🔎 <b>AddisFurnishን ያስሱ</b> — ከኢትዮጵያ ሱቆች ሶፋ፣ አልጋ፣ ጠረጴዛ እና ሌሎችም።",
    findButton: "🛒 እቃዎችን ይመልከቱ",
    savedIntro:
      "❤️ <b>ያስቀመጧቸው እቃዎች</b> — የወደዷቸውን እቃዎች ለመክፈት ከታች ይጫኑ።",
    savedButton: "የተቀመጡ እቃዎችን ይክፈቱ",
    myListingsIntro:
      "📦 <b>የእርስዎ ማስታወቂያዎች</b> — የለጠፏቸውን እቃዎች ይመልከቱ እና ያስተዳድሩ።",
    myListingsButton: "ዳሽቦርዴን ይክፈቱ",
    inquiriesIntro:
      "💬 <b>መልእክቶችዎ</b> — ስለ እቃዎችዎ ምላሾች እና ጥያቄዎች።",
    inquiriesButton: "መልእክቶችን ይክፈቱ",
    alertsIntro:
      "🔔 <b>ማሳወቂያዎችዎን ያስተዳድሩ</b> — የተቀመጡ ፍለጋዎች እና የቴሌግራም ማሳወቂያ ቅንብሮች።",
    alertsButton: "የማሳወቂያ ቅንብሮችን ይክፈቱ",
    accountSummary: (name: string, city: string | null, isSeller: boolean, verified: boolean) =>
      `👤 <b>${name || "መለያዎ"}</b>\n\n📍 ${city ?? "—"}\n${isSeller ? `🏪 ሻጭ${verified ? " · ✅ የተረጋገጠ" : ""}` : "🛍️ ገዢ"}\n\nመገለጫዎን ለመክፈት ከታች ይጫኑ።`,
    accountButton: "👤 መገለጫዬን ይክፈቱ",
    // ── Sell via Bot ──
    sellIntro:
      "🛍️ <b>የረቂቅ ማስታወቂያ እንፍጠር!</b>\n\nእስከ 4 ፎቶዎች ይላኩ (በአንድ መልእክት አንድ)፣ ከዚያ የተጠናቀቀ ይጫኑ።",
    sellPhotosGot: (n: number) =>
      `📷 ${n}/4 ፎቶዎች ደርሰዋል — ተጨማሪ ይላኩ ወይም <b>ተጠናቅቋል</b> ይጫኑ።`,
    sellPhotosFull: "📷 4/4 ፎቶዎች ደርሰዋል — ለመቀጠል <b>ተጠናቅቋል</b> ይጫኑ።",
    sellDonePhotos: "✅ ፎቶዎች ተጠናቀዋል",
    sellCategory: "🏷️ ምድብ ይምረጡ:",
    sellCondition: "📦 ሁኔታ?",
    sellPrice: "💰 ዋጋውን በብር ያስገቡ (ቁጥር ብቻ፣ ለምሳሌ 8500)።",
    sellCity: "📍 የትኛው ከተማ?",
    sellInvalidPrice: "ያ ዋጋ አይመስልም። ቁጥር ይላኩ፣ ለምሳሌ 8500።",
    sellCreating: "⏳ ረቂቅዎን በመፍጠር ላይ…",
    sellDone: (title: string) =>
      `✅ <b>ረቂቅ ተፈጥሯል!</b>\n\n${title}\n\nዝርዝሮቹን ለማጠናቀቅ (ርዕስ፣ መግለጫ፣ ማድረስ…) እና ለማተም ከታች ይጫኑ።`,
    sellFinishButton: "✏️ በመደብሩ ውስጥ ይጨርሱ",
    sellCanceled: "🚫 የመሸጫ ሂደት ተሰርዟል። በማንኛውም ጊዜ /sell ይላኩ።",
    sellCancel: "🚫 ሰርዝ",
    sellTitlePrefix: "አዲስ ማስታወቂያ — ",
  },
} as const;

// Lazy service-role client for the log/blocked helpers — the webhook handler
// creates its own, but these fire from deep inside send paths.
let _db: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_db) {
    _db = createClient(SUPABASE_URL ?? "", SERVICE_ROLE ?? "", {
      auth: { persistSession: false },
    });
  }
  return _db;
}

/** Record a delivery attempt for the admin health view. */
async function logSend(kind: string, chatId: string, ok: boolean, error?: string | null) {
  try {
    await db().from("telegram_delivery_log").insert({
      kind,
      chat_id: chatId,
      ok,
      error: error ?? null,
    });
  } catch {
    // Logging must never break a send.
  }
}

/** Telegram returned 403 — the user blocked the bot. Stop alerting them. */
async function markBlocked(chatId: string) {
  try {
    await db()
      .from("profiles")
      .update({ telegram_blocked: true })
      .eq("telegram_chat_id", chatId);
  } catch {
    // Best-effort.
  }
}

/** Download a Telegram photo (getFile → file bytes) for sell-via-bot drafts. */
async function downloadTelegramFile(fileId: string): Promise<Uint8Array | null> {
  if (!BOT_TOKEN) return null;
  try {
    const meta = (await (
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`)
    ).json()) as { result?: { file_path?: string } };
    const path = meta.result?.file_path;
    if (!path) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// replyMarkup carries the request_contact keyboard during phone verification,
// and { remove_keyboard: true } to clear it again afterwards.
async function sendMessage(chatId: number, text: string, replyMarkup?: unknown): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
      error_code?: number;
    } | null;
    if (!res.ok) {
      await logSend("webhook", String(chatId), false, body?.description ?? `HTTP ${res.status}`);
      if (body?.error_code === 403) await markBlocked(String(chatId));
      return false;
    }
    await logSend("webhook", String(chatId), true, null);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inline "join the channel" prompt with a Join button and a verify button.
 * The Join URL is derived from TELEGRAM_CHANNEL_ID (t.me/<username> for
 * @username, the raw link for t.me/... links; numeric ids can't build a
 * public URL, so those get the text prompt without a button).
 */
/**
 * Best-effort public join URL for the configured channel. @username and
 * t.me/... values map directly; a bare invite hash (as stored for private
 * channels) becomes t.me/+<hash>.
 */
function channelJoinUrl(): string | null {
  if (!CHANNEL_ID) return null;
  if (CHANNEL_ID.startsWith("@")) return `https://t.me/${CHANNEL_ID.slice(1)}`;
  if (CHANNEL_ID.startsWith("https://t.me/")) return CHANNEL_ID;
  // Bare invite hash (64-char hex for a private channel) → t.me/+hash.
  if (/^[A-Za-z0-9_-]{10,}$/.test(CHANNEL_ID)) return `https://t.me/+${CHANNEL_ID}`;
  return null;
}

async function sendChannelPrompt(chatId: number, text: string, verifyLabel: string) {
  if (!BOT_TOKEN || !CHANNEL_ID) return;
  const url = channelJoinUrl();
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            ...(url ? [[{ text: "📢 Join channel", url }]] : []),
            [{ text: verifyLabel, callback_data: "verify_channel_join" }],
          ],
        },
      }),
    });
  } catch {
    // Telegram unreachable — nothing useful to do inside a webhook.
  }
}

async function answerCallback(callbackQueryId: string, text?: string) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text: text.slice(0, 200) } : {}),
      }),
    });
  } catch {
    // Best-effort.
  }
}

/**
 * Membership check via getChatMember. Returns true when the user is a member
 * (including admins/creators and restricted members who are still in).
 */
async function isChannelMember(chatId: number): Promise<boolean | null> {
  if (!BOT_TOKEN || !CHANNEL_ID) return null;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(CHANNEL_ID)}&user_id=${chatId}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok: boolean;
      result?: { status: string; is_member?: boolean };
      description?: string;
    };
    if (!body.ok) {
      console.error("getChatMember failed", body.description);
      return null;
    }
    const status = body.result?.status;
    if (status === "creator" || status === "administrator" || status === "member") return true;
    if (status === "restricted") return body.result?.is_member ?? false;
    return false;
  } catch {
    return null;
  }
}

/**
 * Shared join verification (callback button and /verifyjoin): check channel
 * membership and, when confirmed, mark the profile verified. Returns the
 * outcome so the caller can phrase the reply.
 */
async function verifyAndMark(
  supabase: any,
  profileId: string,
  userId: number,
): Promise<"verified" | "not_member"> {
  const member = await isChannelMember(userId);
  if (member === null) {
    // Same fallback as the callback: an un-resolvable channel id must not
    // lock users out — accept the check as proof, but log loudly so the
    // team knows to switch TELEGRAM_CHANNEL_ID to @username or the numeric
    // id for real verification.
    console.error(
      `channel verify: could not resolve ${CHANNEL_ID.slice(0, 8)}… as a chat — falling back to tap confirmation`,
    );
    await supabase
      .from("profiles")
      .update({ telegram_channel_joined_at: new Date().toISOString() })
      .eq("id", profileId);
    return "verified";
  }
  if (member) {
    await supabase
      .from("profiles")
      .update({ telegram_channel_joined_at: new Date().toISOString() })
      .eq("id", profileId);
    return "verified";
  }
  return "not_member";
}

// ── Sell via Bot ──────────────────────────────────────────────────────────

async function sendCategoryPicker(supabase: ReturnType<typeof createClient>, chatId: number, copy: (typeof COPY)[Lang], lang: Lang) {
  const { data: cats } = await supabase
    .from("categories")
    .select("id,name,name_am,parent_id")
    .order("sort_order");
  const roots = (cats ?? []).filter((c: { parent_id: string | null }) => !c.parent_id).slice(0, 12);
  const kb: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < roots.length; i += 2) {
    kb.push(
      roots.slice(i, i + 2).map((c: { id: string; name: string; name_am: string | null }) => ({
        text: lang === "am" && c.name_am ? c.name_am : c.name,
        callback_data: `sell_cat:${c.id}`,
      })),
    );
  }
  kb.push([{ text: copy.sellCancel, callback_data: "sell_cancel" }]);
  await sendMessage(chatId, copy.sellCategory, { inline_keyboard: kb });
}

async function sendConditionPicker(chatId: number, copy: (typeof COPY)[Lang]) {
  const kb = CONDITIONS.map((o) => [{ text: o, callback_data: `sell_cond:${o}` }]);
  kb.push([{ text: copy.sellCancel, callback_data: "sell_cancel" }]);
  await sendMessage(chatId, copy.sellCondition, { inline_keyboard: kb });
}

/**
 * Create the DRAFT listing + upload photos + send the finish-in-marketplace
 * button. Never publishes: the marketplace editor owns status → active.
 */
async function finalizeSellDraft(
  supabase: ReturnType<typeof createClient>,
  chatId: number,
  userId: string,
  session: { id: string; category_id: string | null; condition: string | null; price: number | string | null; city: string | null; photo_file_ids: string[] | null },
  copy: (typeof COPY)[Lang],
) {
  const { data: cat } = await supabase
    .from("categories")
    .select("name")
    .eq("id", session.category_id ?? "")
    .maybeSingle();
  const price = Number(session.price);
  await sendMessage(chatId, copy.sellCreating);

  // Telegram photo → storage.
  const paths: string[] = [];
  const fids = session.photo_file_ids ?? [];
  for (let i = 0; i < fids.length && i < MAX_SELL_PHOTOS; i++) {
    const bytes = await downloadTelegramFile(fids[i]);
    if (!bytes) continue;
    const path = `${userId}/bot-${Date.now()}-${i}.jpg`;
    const { error } = await supabase.storage
      .from("listing-images")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (!error) paths.push(path);
  }

  const { data: draft, error } = await supabase
    .from("listings")
    .insert({
      seller_id: userId,
      title: `${copy.sellTitlePrefix}${cat?.name ?? ""}`.trim(),
      description: "",
      price,
      negotiable: true,
      condition: session.condition ?? "Used - Good",
      city: session.city ?? "Addis Ababa",
      status: "draft",
      category_id: session.category_id,
    })
    .select("id")
    .single();
  if (error || !draft) {
    console.error("sell draft create failed", error);
    await sendMessage(chatId, copy.invalid);
    return;
  }
  if (paths.length > 0) {
    await supabase
      .from("listing_images")
      .insert(paths.map((p, i) => ({ listing_id: draft.id, url: p, position: i })));
  }
  await supabase.from("telegram_sell_sessions").delete().eq("id", session.id);

  const finishUrl = `${SITE_URL}/sell?edit=${draft.id}`;
  await sendMessage(chatId, copy.sellDone(`🏷️ ${cat?.name ?? ""} · 💰 ${price.toLocaleString()} ETB · 📍 ${session.city ?? "—"}`), {
    inline_keyboard: [[{ text: copy.sellFinishButton, url: finishUrl }]],
  });
}

// Mirror of normalizePhone in web/src/lib/otp.ts. Duplicated rather than
// imported because edge functions can't reach web/src — keep the two in step.
// Ethiopian mobile numbers: 09xxxxxxxx / 9xxxxxxxx / +2519xxxxxxxx → +2519xxxxxxxx.
function normalizePhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  let n = digits.startsWith("+") ? digits.slice(1) : digits;
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0")) n = `251${n.slice(1)}`;
  else if (n.length === 9 && (n.startsWith("9") || n.startsWith("7"))) n = `251${n}`;
  if (!/^[1-9]\d{7,14}$/.test(n)) return null;
  return `+${n}`;
}

// Clears a pending phone verification. Used on expiry, on /stop, and after a
// successful run.
const PENDING_CLEARED = {
  phone_verify_token: null,
  phone_verify_token_expires_at: null,
  phone_verify_phone: null,
  phone_verify_chat_id: null,
} as const;

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
  if (!body || !SUPABASE_URL || !SERVICE_ROLE) {
    // Always 200 to Telegram — a non-2xx makes it retry the same update.
    return new Response("ok", { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // ── Idempotency ────────────────────────────────────────────────────────
  // Telegram redelivers an update when we're slow to ack. The PRIMARY KEY on
  // update_id turns a repeat into a no-op, so a retried webhook can't create
  // a duplicate draft, link, or notification.
  const updateId = body.update_id as number | undefined;
  if (typeof updateId === "number") {
    const { error: dupErr } = await supabase
      .from("telegram_processed_updates")
      .insert({ update_id: updateId });
    if (dupErr) {
      return new Response("ok", { status: 200 }); // already processed
    }
  }

  // ── Callback queries: language switch + sell-via-bot steps ─────────────
  const callback = body.callback_query as
    | { id?: string; data?: string; from?: { id?: number }; message?: { chat?: { id?: number } } }
    | undefined;
  if (callback?.data?.startsWith("lang:")) {
    const cbChatId = (callback.message?.chat?.id ?? callback.from?.id) as number | undefined;
    if (!cbChatId) return new Response("ok", { status: 200 });
    const toLang: Lang = callback.data === "lang:am" ? "am" : "en";
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_chat_id", String(cbChatId))
      .maybeSingle();
    if (prof) {
      await supabase.from("profiles").update({ preferred_language: toLang }).eq("id", prof.id);
    }
    await answerCallback(callback.id ?? "", "✅");
    await sendMessage(cbChatId, COPY[toLang].langSet(toLang === "am" ? "አማርኛ" : "English"));
    return new Response("ok", { status: 200 });
  }

  if (callback?.data?.startsWith("sell_")) {
    const cbChatId = (callback.message?.chat?.id ?? callback.from?.id) as number | undefined;
    if (!cbChatId) return new Response("ok", { status: 200 });
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, preferred_language")
      .eq("telegram_chat_id", String(cbChatId))
      .maybeSingle();
    const sLang: Lang = prof?.preferred_language === "am" ? "am" : "en";
    const sCopy = COPY[sLang];
    const { data: session } = await supabase
      .from("telegram_sell_sessions")
      .select("*")
      .eq("chat_id", String(cbChatId))
      .maybeSingle();
    if (!session) {
      await answerCallback(callback.id ?? "", "Send /sell to start.");
      return new Response("ok", { status: 200 });
    }
    const data = callback.data;
    if (data === "sell_cancel") {
      await supabase.from("telegram_sell_sessions").delete().eq("id", session.id);
      await answerCallback(callback.id ?? "", "🚫");
      await sendMessage(cbChatId, sCopy.sellCanceled);
      return new Response("ok", { status: 200 });
    }
    if (data === "sell_done_photos") {
      await answerCallback(callback.id ?? "", "✅");
      await supabase.from("telegram_sell_sessions").update({ step: "category" }).eq("id", session.id);
      await sendCategoryPicker(supabase, cbChatId, sCopy, sLang);
      return new Response("ok", { status: 200 });
    }
    if (data.startsWith("sell_cat:")) {
      await answerCallback(callback.id ?? "", "✅");
      await supabase
        .from("telegram_sell_sessions")
        .update({ category_id: data.slice("sell_cat:".length), step: "condition" })
        .eq("id", session.id);
      await sendConditionPicker(cbChatId, sCopy);
      return new Response("ok", { status: 200 });
    }
    if (data.startsWith("sell_cond:")) {
      await answerCallback(callback.id ?? "", "✅");
      await supabase
        .from("telegram_sell_sessions")
        .update({ condition: data.slice("sell_cond:".length), step: "price" })
        .eq("id", session.id);
      await sendMessage(cbChatId, sCopy.sellPrice);
      return new Response("ok", { status: 200 });
    }
    if (data.startsWith("sell_city:")) {
      await answerCallback(callback.id ?? "", "✅");
      await supabase
        .from("telegram_sell_sessions")
        .update({ city: data.slice("sell_city:".length), step: "done" })
        .eq("id", session.id);
      const fresh = (await supabase
        .from("telegram_sell_sessions")
        .select("*")
        .eq("id", session.id)
        .maybeSingle()) as { data: typeof session | null };
      await finalizeSellDraft(
        supabase,
        cbChatId,
        String(prof?.id ?? session.user_id),
        (fresh.data ?? session) as never,
        sCopy,
      );
      return new Response("ok", { status: 200 });
    }
    return new Response("ok", { status: 200 });
  }

  // ── Callback query: "✅ I've joined — verify" ─────────────────────────
  if (callback?.data === "verify_channel_join") {
    const cbChatId = (callback.message?.chat?.id ?? callback.from?.id) as number | undefined;
    const cbUserId = (callback.from?.id ?? cbChatId) as number | undefined;
    if (!cbChatId || !cbUserId) {
      await answerCallback(callback.id ?? "", "Something went wrong — try again.");
      return new Response("ok", { status: 200 });
    }

    const { data: cbProfile } = await supabase
      .from("profiles")
      .select("id, preferred_language, telegram_chat_id, telegram_channel_joined_at")
      .eq("telegram_chat_id", String(cbChatId))
      .maybeSingle();
    const cbCopy = COPY[cbProfile?.preferred_language === "am" ? "am" : "en"];

    if (!cbProfile) {
      await answerCallback(callback.id ?? "", cbCopy.notLinked);
      return new Response("ok", { status: 200 });
    }
    if (cbProfile.telegram_channel_joined_at) {
      await answerCallback(callback.id ?? "", cbCopy.alreadyVerified);
      return new Response("ok", { status: 200 });
    }

    const outcome = await verifyAndMark(supabase, cbProfile.id, cbUserId);
    if (outcome === "verified") {
      await answerCallback(callback.id ?? "", "✅");
      await sendMessage(cbChatId, cbCopy.joinVerified);
    } else {
      await answerCallback(callback.id ?? "", cbCopy.joinNotYet);
    }
    return new Response("ok", { status: 200 });
  }

  const message = body.message;
  if (!message) {
    // A non-message, non-callback update (e.g. channel post) — nothing to do.
    return new Response("ok", { status: 200 });
  }

  const chatId = message.chat?.id as number | undefined;
  const text = (message.text ?? "").trim();
  if (!chatId) return new Response("ok", { status: 200 });

  // Language follows the account when this chat is already linked.
  const { data: current } = await supabase
    .from("profiles")
    .select("id, preferred_language, telegram_channel_joined_at, telegram_blocked")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();
  // If the bot can receive a message from this chat, the user isn't blocking
  // it anymore — clear the auto-set flag so alerts resume.
  if (current?.telegram_blocked) {
    await supabase.from("profiles").update({ telegram_blocked: false }).eq("id", current.id);
  }
  const lang: Lang = current?.preferred_language === "am" ? "am" : "en";
  const copy = COPY[lang];

  // /help works for linked and unlinked chats alike.
  if (text === "/help") {
    await sendMessage(chatId, copy.help(SITE_URL));
    return new Response("ok", { status: 200 });
  }

  // ── Shared contact: the phone-verification proof ───────────────────────
  // Runs before the command branches — a shared contact arrives with no text,
  // so it would otherwise fall through to the /help fallback. Needs its own
  // lookup because `current` keys on telegram_chat_id, which is deliberately
  // not set until this check passes.
  const contact = message.contact as
    | { phone_number?: string; user_id?: number }
    | undefined;
  if (contact) {
    const { data: pending } = await supabase
      .from("profiles")
      .select("id, preferred_language, phone_verify_phone, phone_verify_token_expires_at")
      .eq("phone_verify_chat_id", String(chatId))
      .maybeSingle();

    if (!pending) {
      await sendMessage(chatId, copy.shareNoPending, { remove_keyboard: true });
      return new Response("ok", { status: 200 });
    }

    const pendingCopy = COPY[pending.preferred_language === "am" ? "am" : "en"];
    const expiresAt = pending.phone_verify_token_expires_at as string | null;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      await supabase.from("profiles").update(PENDING_CLEARED).eq("id", pending.id);
      await sendMessage(chatId, pendingCopy.expired, { remove_keyboard: true });
      return new Response("ok", { status: 200 });
    }

    // THE check. Telegram populates contact.user_id only when the shared
    // contact is a real Telegram account, and it is that account's id — so a
    // contact card forwarded from the address book carries someone else's id
    // or none at all. Without this, anyone could verify a number they do not
    // own by forwarding its owner's contact.
    if (!contact.user_id || contact.user_id !== message.from?.id) {
      await sendMessage(chatId, pendingCopy.shareNotOwn, { remove_keyboard: true });
      return new Response("ok", { status: 200 });
    }

    const shared = normalizePhone(contact.phone_number ?? "");
    const wanted = pending.phone_verify_phone as string | null;
    if (!wanted || !shared || shared !== wanted) {
      await sendMessage(chatId, pendingCopy.shareMismatch(wanted ?? "—"), {
        remove_keyboard: true,
      });
      return new Response("ok", { status: 200 });
    }

    // Proven. Link the chat for notifications too, detaching it from any other
    // account first because telegram_chat_id is UNIQUE.
    await supabase
      .from("profiles")
      .update({ telegram_chat_id: null, telegram_linked_at: null })
      .eq("telegram_chat_id", String(chatId))
      .neq("id", pending.id);

    const { error: linkErr } = await supabase
      .from("profiles")
      .update({
        telegram_chat_id: String(chatId),
        telegram_linked_at: new Date().toISOString(),
        ...PENDING_CLEARED,
      })
      .eq("id", pending.id);
    if (linkErr) {
      console.error("phone verify link failed", linkErr);
      await sendMessage(chatId, pendingCopy.invalid, { remove_keyboard: true });
      return new Response("ok", { status: 200 });
    }

    // Only now does a code exist. Generated here rather than in the web app so
    // there is no window where a code is live for an unproven number.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await supabase
      .from("phone_otps")
      .delete()
      .eq("user_id", pending.id)
      .eq("phone", wanted);
    const { error: otpErr } = await supabase.from("phone_otps").insert({
      user_id: pending.id,
      phone: wanted,
      code,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (otpErr) {
      console.error("phone verify code insert failed", otpErr);
      await sendMessage(chatId, pendingCopy.invalid, { remove_keyboard: true });
      return new Response("ok", { status: 200 });
    }

    await sendMessage(chatId, pendingCopy.codeSent(code), { remove_keyboard: true });
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/start")) {
    const token = text.slice("/start".length).trim();
    if (!token) {
      await sendMessage(chatId, copy.noToken);
      return new Response("ok", { status: 200 });
    }

    // Two kinds of token arrive here. A phone-verify token (minted by
    // mint_phone_verify_token) must not link anything yet — it only asks for
    // the contact, and the contact branch above does the linking once the
    // number is proven. A plain link token keeps the original behaviour.
    const { data: verifying } = await supabase
      .from("profiles")
      .select("id, preferred_language, phone_verify_phone, phone_verify_token_expires_at")
      .eq("phone_verify_token", token)
      .maybeSingle();

    if (verifying) {
      const vCopy = COPY[verifying.preferred_language === "am" ? "am" : "en"];
      const vExpires = verifying.phone_verify_token_expires_at as string | null;
      if (vExpires && new Date(vExpires).getTime() < Date.now()) {
        await supabase.from("profiles").update(PENDING_CLEARED).eq("id", verifying.id);
        await sendMessage(chatId, vCopy.expired);
        return new Response("ok", { status: 200 });
      }

      // Remember which chat is mid-verification; the contact arrives as a
      // separate webhook call and edge functions keep no memory between them.
      await supabase
        .from("profiles")
        .update({ phone_verify_chat_id: String(chatId) })
        .eq("id", verifying.id);

      await sendMessage(chatId, vCopy.shareAsk(verifying.phone_verify_phone as string), {
        keyboard: [[{ text: vCopy.shareButton, request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      });
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

    // Channel gate: if a channel is configured, new links must join and verify
    // before alerts flow (telegram-notify skips chats without the flag).
    if (CHANNEL_ID) {
      await sendChannelPrompt(chatId, linkedCopy.joinAsk, linkedCopy.joinButton);
    }
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/join")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    if (current.telegram_channel_joined_at) {
      await sendMessage(chatId, copy.alreadyVerified);
      return new Response("ok", { status: 200 });
    }
    if (!CHANNEL_ID) {
      await sendMessage(chatId, copy.joinNotFound);
      return new Response("ok", { status: 200 });
    }
    await sendChannelPrompt(chatId, copy.joinAsk, copy.joinButton);
    return new Response("ok", { status: 200 });
  }

  // /verifyjoin — same membership check as the "✅ I've joined" button, but
  // triggered by typing instead of a tap.
  if (text.startsWith("/verifyjoin")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    if (current.telegram_channel_joined_at) {
      await sendMessage(chatId, copy.alreadyVerified);
      return new Response("ok", { status: 200 });
    }
    if (!CHANNEL_ID) {
      await sendMessage(chatId, copy.joinNotFound);
      return new Response("ok", { status: 200 });
    }
    const outcome = await verifyAndMark(supabase, current.id, message.from?.id ?? chatId);
    await sendMessage(chatId, outcome === "verified" ? copy.joinVerified : copy.joinNotYet);
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
        ...PENDING_CLEARED,
      })
      .eq("id", current.id);
    await sendMessage(chatId, copy.stopped, { remove_keyboard: true });
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/lang")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    await sendMessage(chatId, copy.langAsk, {
      inline_keyboard: [
        [
          { text: "English 🇬🇧", callback_data: "lang:en" },
          { text: "አማርኛ 🇪🇹", callback_data: "lang:am" },
        ],
      ],
    });
    return new Response("ok", { status: 200 });
  }

  // ── Marketplace shortcut commands (deep links into the web app) ────────
  // /find is public; the rest need a linked account and open the matching
  // page via an inline button. The guard mirrors /sell: unlinked chats get
  // the same "connect first" message instead of an error.
  if (text.startsWith("/find")) {
    if (!SITE_URL) {
      await sendMessage(chatId, copy.invalid);
      return new Response("ok", { status: 200 });
    }
    await sendMessage(chatId, copy.findIntro, {
      inline_keyboard: [[{ text: copy.findButton, url: SITE_URL }]],
    });
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/saved")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    await sendMessage(chatId, copy.savedIntro, {
      inline_keyboard: [[{ text: copy.savedButton, url: `${SITE_URL}/favorites` }]],
    });
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/mylistings")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    await sendMessage(chatId, copy.myListingsIntro, {
      inline_keyboard: [[{ text: copy.myListingsButton, url: `${SITE_URL}/dashboard` }]],
    });
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/inquiries")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    await sendMessage(chatId, copy.inquiriesIntro, {
      inline_keyboard: [[{ text: copy.inquiriesButton, url: `${SITE_URL}/messages` }]],
    });
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/alerts")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    await sendMessage(chatId, copy.alertsIntro, {
      inline_keyboard: [[{ text: copy.alertsButton, url: `${SITE_URL}/profile` }]],
    });
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/account")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    const { data: acct } = await supabase
      .from("profiles")
      .select("full_name, shop_name, city, is_seller, verified")
      .eq("id", current.id)
      .maybeSingle();
    const name =
      (acct?.shop_name as string | null) ?? (acct?.full_name as string | null) ?? "";
    await sendMessage(
      chatId,
      copy.accountSummary(
        name,
        (acct?.city as string | null) ?? null,
        !!acct?.is_seller,
        !!acct?.verified,
      ),
      { inline_keyboard: [[{ text: copy.accountButton, url: `${SITE_URL}/profile` }]] },
    );
    return new Response("ok", { status: 200 });
  }

  if (text.startsWith("/sell")) {
    if (!current) {
      await sendMessage(chatId, copy.notLinked);
      return new Response("ok", { status: 200 });
    }
    // Fresh start — drop any half-finished session for this chat.
    await supabase.from("telegram_sell_sessions").delete().eq("chat_id", String(chatId));
    const { error: sessErr } = await supabase.from("telegram_sell_sessions").insert({
      user_id: current.id,
      chat_id: String(chatId),
      step: "photos",
    });
    if (sessErr) {
      console.error("sell session start failed", sessErr);
      await sendMessage(chatId, copy.invalid);
      return new Response("ok", { status: 200 });
    }
    await sendMessage(chatId, copy.sellIntro);
    return new Response("ok", { status: 200 });
  }

  // ── Sell-via-bot state machine: photos and price arrive as messages. ───
  const { data: sellSession } = await supabase
    .from("telegram_sell_sessions")
    .select("*")
    .eq("chat_id", String(chatId))
    .maybeSingle();
  // /cancel with nothing in flight is a no-op, not an error.
  if (text === "/cancel" && !sellSession) {
    await sendMessage(chatId, copy.sellCanceled);
    return new Response("ok", { status: 200 });
  }
  if (sellSession) {
    if (text === "/cancel") {
      await supabase.from("telegram_sell_sessions").delete().eq("id", sellSession.id);
      await sendMessage(chatId, copy.sellCanceled);
      return new Response("ok", { status: 200 });
    }
    if (sellSession.step === "photos") {
      const photo = (message.photo as { file_id?: string }[] | undefined)?.slice(-1)[0];
      if (!photo?.file_id) {
        await sendMessage(chatId, copy.sellPhotosGot((sellSession.photo_file_ids ?? []).length));
        return new Response("ok", { status: 200 });
      }
      const fids = [...(sellSession.photo_file_ids ?? []), photo.file_id].slice(0, MAX_SELL_PHOTOS);
      await supabase
        .from("telegram_sell_sessions")
        .update({ photo_file_ids: fids, updated_at: new Date().toISOString() })
        .eq("id", sellSession.id);
      const kb = [
        [{ text: copy.sellDonePhotos, callback_data: "sell_done_photos" }],
        [{ text: copy.sellCancel, callback_data: "sell_cancel" }],
      ];
      await sendMessage(
        chatId,
        fids.length >= MAX_SELL_PHOTOS ? copy.sellPhotosFull : copy.sellPhotosGot(fids.length),
        { inline_keyboard: kb },
      );
      return new Response("ok", { status: 200 });
    }
    if (sellSession.step === "price") {
      const n = Number((text ?? "").replace(/[^\d]/g, ""));
      if (!text || Number.isNaN(n) || n <= 0) {
        await sendMessage(chatId, copy.sellInvalidPrice);
        return new Response("ok", { status: 200 });
      }
      await supabase
        .from("telegram_sell_sessions")
        .update({ price: n, step: "city", updated_at: new Date().toISOString() })
        .eq("id", sellSession.id);
      const kb = CITIES.map((c) => [{ text: c, callback_data: `sell_city:${c}` }]);
      kb.push([{ text: copy.sellCancel, callback_data: "sell_cancel" }]);
      await sendMessage(chatId, copy.sellCity, { inline_keyboard: kb });
      return new Response("ok", { status: 200 });
    }
    // Any other step while a session is live: nudge toward the buttons.
    await sendMessage(chatId, copy.fallback);
    return new Response("ok", { status: 200 });
  }

  await sendMessage(chatId, copy.fallback);
  return new Response("ok", { status: 200 });
});
