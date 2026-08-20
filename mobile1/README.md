# HabeshaHome Mobile (Flutter)

The official Flutter mobile app for the HabeshaHome used-furniture marketplace —
the same Supabase backend as the web app and the React Native app, with
phone-first login, realtime chat, GPS "near me" browsing, camera-first listing
and in-app notifications.

## Stack

- **Flutter** (SDK ^3.12) with Material 3
- **supabase_flutter** — auth (OTP / email / Google), Postgres, Storage, Realtime
- **get_it** service locator, **shared_preferences** offline cache,
  **connectivity_plus** offline banner, **geolocator** + **flutter_map** (near-me)
- **image_picker** camera/gallery, **share_plus**, **url_launcher**,
  **google_fonts** (Fraunces + DM Sans)

## Requirements

- Flutter SDK (`flutter --version` → 3.44+ recommended)
- A configured Supabase project (the shared `../supabase` migrations + edge
  functions from this repo)

## Setup & run

The Supabase URL + public anon key are compile-time values passed via Dart
defines. Copy the example config, fill in your keys, and run:

```bash
cd mobile
cp env.example.json env.json   # then edit env.json with your keys
flutter pub get

# either point directly at the JSON config file…
flutter run --dart-define-from-file=env.json

# …or pass the values on the command line
flutter run \
  --dart-define=SUPABASE_URL=https://<project>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<your-public-anon-key>
```

| Define | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Public project URL |
| `SUPABASE_ANON_KEY` | yes | Public anon/publishable key from the dashboard |
| `GOOGLE_WEB_CLIENT_ID` | google sign-in | Web client ID from Google Cloud Console (iOS also needs `GOOGLE_IOS_CLIENT_ID`) |

The app shows a friendly "Supabase is not configured" message when the defines
are missing, so you can still open the shell.

## Feature areas

- **Home / Browse** — hero search, trending chips, category grid, featured +
  fresh listings. Browse tab has full filters (category, condition, material,
  room, city, price range), sort chips incl. GPS "nearest", saved searches.
- **Auth** — SMS OTP (passwordless), email, Google OAuth; one account, sellers
  upgrade in place.
- **Sell** — multi-photo listing form, publish/edit/delete, mark sold.
- **Messages** — 1:1 chat with realtime delivery, edit/delete own messages.
- **Profile / Dashboard / Verification** — shop setup, seller dashboard with
  view counts, verification-document upload/review.
- **Notifications** — in-app centre + realtime.

## Platform scaffolding

```bash
flutter run -d <device>    # Android / iOS
flutter build apk --debug --dart-define-from-file=env.json   # Android APK
```