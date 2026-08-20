# HabeshaHome Mobile (React Native + Expo)

The official mobile app for the HabeshaHome used-furniture marketplace — the same
Supabase backend as the web app, with phone-first login, realtime chat, GPS
"near me" browsing, and camera-first listing.

## Stack

- **Expo SDK 57** with `expo-router` (file-based navigation, TypeScript)
- **Supabase** (`@supabase/supabase-js`) — sessions persisted in
  **expo-secure-store** (encrypted) on native, localStorage on web
- **Realtime Postgres Changes** for live chat + in-app notifications
- **expo-location** (near-me sort), **expo-image-picker** (camera/gallery),
  **expo-notifications** (local bridge + Expo Push Service tokens)

## Setup

```bash
cd mobile
cp .env.example .env   # then fill in the two EXPO_PUBLIC_ values
npm install
npx expo start         # scan the QR code with Expo Go, or press `a`/`i`
```

`.env` needs:

```
EXPO_PUBLIC_SUPABASE_URL=<your project url>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your publishable key>
```

The `.env` is git-ignored-ish (only `*.local` is in the default gitignore, so
keep real keys out of version control).

## Screens

| Route | Purpose |
| --- | --- |
| `(tabs)/index` | Home — hero search, trending searches, categories, featured & fresh listings |
| `(tabs)/browse` | Search + filters + sorts, **GPS near-me**, save-search alerts |
| `(tabs)/sell` | Create shop profile (one-tap seller upgrade), then publish listings with camera/gallery photos, delivery & discount-expiry fields |
| `(tabs)/messages` | Conversations list (realtime) |
| `(tabs)/profile` | Account, shop setup, verification-document submission, buyer alert preferences, Amharic/English toggle |
| `listing/[id]` | Photo carousel, price/discount countdown, delivery info, seller card (call/WhatsApp/Telegram), message, favorites, reviews, similar items |
| `shop/[slug]` | Shop profile with listings + reviews |
| `chat/[id]` | Realtime 1:1 chat |
| `auth` | Phone-first OTP login (+ email/password fallback) |
| `notifications` | In-app notification center |

## Notes

- **Auth**: the web app's OTP flow runs through server functions; the mobile
  app uses Supabase's native `signInWithOtp`/`verifyOtp` (same `auth.users`).
- **Push notifications**: the app registers an **Expo push token** per device
  (`push_tokens` table) and deep-links on tap. While the app is open, banners
  come from the realtime subscription; in background/killed state they come
  from Expo Push Service via the `send-push` edge function, which the DB
  trigger (`push_on_notification`) calls on every notifications insert.

### Push notifications setup (one-time)

1. **Deploy the edge function** (from the repo root):
   ```bash
   supabase functions deploy send-push
   ```
   Secrets: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are injected
   automatically. Set `EXPO_ACCESS_TOKEN` (from expo.dev → account settings)
   for authenticated sends / higher rate limits:
   ```bash
   supabase secrets set EXPO_ACCESS_TOKEN=<token>
   ```
2. **Apply the migration** so the trigger forwards inserts:
   ```bash
   supabase db push   # applies 20260802090000_push_notifications.sql
   ```
3. **Test**: run the app (Expo Go or a dev build), sign in — the device
   registers its token. From the expo.dev project dashboard → *Notifications →
   Push tool*, paste the ExpoPushToken and send a test message.

> For real production pushes you also need a **development/production build**
> (`npx expo run:android` or an EAS build) with the project's `projectId` set
> in `app.json` → `extra.eas.projectId` — tokens from Expo Go only work while
> the app runs in Expo Go.
- **Photo uploads**: uploads use `FormData` (the required React Native pattern)
  into the `listing-images` bucket; verification documents go to the private
  `verification-docs` bucket (owner + admin only).

## Validation

```bash
npx tsc --noEmit      # typecheck
npx expo-doctor       # dependency/config health
npx expo export       # bundle validation (android/ios/web)
```
