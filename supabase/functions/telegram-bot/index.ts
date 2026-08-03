// Telegram bot webhook — handles the t.me/YourBot?start=TOKEN deep link so a
// buyer's or seller's Telegram chat gets linked to their SuqBet account.
//
// Deploy:
//   supabase functions deploy telegram-bot
//   # then set the webhook:
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d "url=https://<project>.supabase.co/functions/v1/telegram-bot"
//
// Required secrets: TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function sendMessage(chatId: number, text: string) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await req.json().catch(() => null);
  const message = body?.message;
  if (!message || !SUPABASE_URL || !SERVICE_ROLE) {
    return new Response("ok", { status: 200 });
  }

  const chatId = message.chat?.id as number | undefined;
  const text = (message.text ?? "").trim();
  if (!chatId) return new Response("ok", { status: 200 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  if (text.startsWith("/start")) {
    const token = text.replace("/start", "").trim();
    if (token) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, shop_name, telegram_chat_id")
        .eq("telegram_link_token", token)
        .maybeSingle();

      if (profile) {
        await supabase
          .from("profiles")
          .update({ telegram_chat_id: String(chatId) })
          .eq("id", profile.id);
        await sendMessage(
          chatId,
          `✅ Linked to <b>${profile.shop_name ?? "your SuqBet account"}</b>.\nYou will now get alerts here.`,
        );
      } else {
        await sendMessage(
          chatId,
          "This link is invalid or expired. Open it again from your SuqBet account settings.",
        );
      }
    } else {
      await sendMessage(chatId, "Hello! Use a link from your SuqBet account to connect.");
    }
  } else {
    await sendMessage(
      chatId,
      "I send alerts for your SuqBet account. Use the link from your profile to connect.",
    );
  }

  return new Response("ok", { status: 200 });
});
