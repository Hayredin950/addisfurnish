# SuqBet — Used Furniture Marketplace (Ethiopia)

A web + mobile marketplace connecting furniture sellers (companies/shops) with
buyers in Ethiopia.

**Deployment**: see [`DEPLOYMENT.md`](DEPLOYMENT.md) — the web app deploys to
Vercel or Cloudflare, the mobile app ships via Expo EAS.

## Repository structure

```
suqbet/
├── web/          # Web app — React + TanStack Start + Vite (SSR), the marketplace UI
├── mobile/       # Mobile app — React Native + Expo (expo-router), companion iOS/Android app
└── supabase/     # Shared backend — migrations, edge functions (telegram-bot, send-push)
```

The two apps are **separate folders, side by side** — each has its own
`package.json`, dependencies and lockfile, and can be pushed/deployed
independently. They share one Supabase project: the same database migrations
(`supabase/migrations/`) and edge functions (`supabase/functions/`) serve both.

## Web app (`web/`)

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd web
npm i            # or: bun install
npm run dev      # → http://localhost:8080
```

See [`web/README.md`](web/README.md) for app-specific details.

## Mobile app (`mobile/`)

The `mobile/` folder is the companion iOS/Android app — same Supabase backend,
phone-first login, realtime chat, GPS "near me" browsing, camera-first listing
and **real push notifications** (Expo Push Service). See
[`mobile/README.md`](mobile/README.md) for setup:

```sh
cd mobile
npm install
npx expo start    # scan the QR with Expo Go, or press `w` for the web version
```

The mobile app mirrors the web database schema
(`mobile/src/lib/db-types.ts` mirrors `web/src/integrations/supabase/types.ts`),
so every migration applies to both.

## Marketplace features

This app implements the SuqBet used-furniture marketplace spec:

- **Auth (phone-first)** — passwordless registration & login via SMS OTP on the `/auth` page (one account; becoming a seller is an upgrade in place, not a separate signup). Email and Google remain as fallbacks. OTPs: 5-min expiry, 5-attempt lock, rate-limited per phone (3/10 min) and per IP (5/10 min), one-time password rotated after each login.
- **Trust & safety** — seller reviews & ratings, report listing/shop flows, and an admin panel (`/admin`) with a moderation queue, seller verification, and platform stats.
- **Seller verification** — sellers submit an ID/business-license document from their profile; admins review it in `/admin → Verification` with a document viewer, one-click approve/reject (reason required on reject), and a full decision audit trail. Sellers can list immediately after creating their shop — verification only gates the verified badge. On each decision the seller is notified in-app, by push (mobile) and on Telegram (if linked). Admins can also revoke all sessions and suspend (ban) accounts.
- **Push notifications (mobile)** — the app registers an Expo push token per device; a DB trigger forwards every `notifications` insert to the `send-push` edge function, which delivers it to expo.dev. Tapping a push deep-links into the listing/notifications. Setup: `supabase functions deploy send-push`, then `supabase db push`.
- **Localization** — English/አማርኛ toggle in the header (persisted per account).
- **Discovery** — live view counting, recently viewed (“Seen this”), popular/trending searches, shareable listing links.
- **Communication** — realtime chat delivery, in-app notification center (bell + `/notifications`), callback requests with contacted/closed tracking, price-drop alerts on saved items, saved-search match alerts.
- **Seller tools** — online/offline indicator, WhatsApp & Telegram contact buttons, dashboard stats + 14-day views chart, registration/license number field, shop logo upload.
- **Telegram** — auto-posts every new listing to a public channel; account-linking bots are scaffolded (see `supabase/functions/README.md`).

### Database

Apply the migrations with `supabase db push`. Migrations add `reports`,
`notifications`, `recently_viewed`, `search_log`, `listing_views`,
`saved_searches`, `buyer_preferences`, `seller_verification_documents`,
`verification_decisions`, `push_tokens`, plus the phone-OTP auth columns.

### Making yourself an admin

Run this once in the Supabase SQL editor, replacing the user id:

```sql
insert into public.user_roles (user_id, role) values ('<your-auth-user-id>', 'admin');
```

### Telegram channel posting (optional)

Set these environment variables to enable auto-posting to a public channel:
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `SITE_URL`. Full setup in
`supabase/functions/README.md`.

### Phone OTP (login + verification)

Phone OTP lives in `web/src/lib/otp.ts` — both the passwordless login flow
(`requestAuthOtp` / `verifyAuthOtp` / `rotateAuthPassword`) and the
“verify your phone” profile feature. Without an SMS provider it runs in dev
mode and prints the code to the server console (and shows it in the UI). To
send real SMS, set one of:

```
# Twilio (default)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
```

For an Ethiopian gateway (Afromessage, GeezSMS, …) replace the `sendSms()`
function in `web/src/lib/otp.ts` — it is the single delivery touchpoint.

### Phone-OTP accounts and existing users

Because the flow signs users in through a rotated one-time password, an
existing email/Google account that logs in via phone OTP gets the phone linked
as its primary login — its previous email password is superseded (phone OTP
becomes the way in). New phone sign-ups are created automatically on first
verification (buyer role by default).
