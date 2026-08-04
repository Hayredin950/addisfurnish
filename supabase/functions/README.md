# Telegram integration

## 1. Public listings channel (Phase 1)

Every new listing is posted to your public Telegram channel (photo, price,
category, link back to the listing) right after the seller publishes it.

It's implemented as a **server function** (`src/lib/server/telegram.ts`) called
from the sell flow, so the bot token never reaches the browser. When the env
vars below are missing it's a safe no-op.

Set these on the hosting environment (Vercel/Railway/Render envs):

| Variable              | Example                      | Purpose                        |
| --------------------- | ---------------------------- | ------------------------------ |
| `TELEGRAM_BOT_TOKEN`  | `123456:ABC-DEF…`            | Bot from @BotFather            |
| `TELEGRAM_CHANNEL_ID` | `@addisfurnish_listings`           | Channel where the bot is admin |
| `SITE_URL`            | `https://addisfurnish.vercel.app` | Used to build the listing link |

## 2. Buyer / seller notification bots (Phase 2 groundwork)

Account linking: `src/lib/server/telegram.ts` exports `getTelegramDeepLink`,
which mints a per-user token and returns a `t.me/YourBot?start=TOKEN` link. The
webhook in `supabase/functions/telegram-bot/index.ts` exchanges that token for
the user's `chat_id` (stored on `profiles.telegram_chat_id`).

Deploy the webhook:

```bash
supabase functions deploy telegram-bot
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<project>.supabase.co/functions/v1/telegram-bot"
```

Set secrets: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
and on the app server `TELEGRAM_BOT_USERNAME` (e.g. `addisfurnish_bot`).

Once a user has a `chat_id`, any alert is just an API call to
`sendMessage`. Rate limits (~30 msg/s across users, ~20/min to one channel) only
matter far beyond MVP scale.
