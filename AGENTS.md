# AddisHome — Agent Guide

AddisHome is a used-furniture marketplace for Ethiopia. Two apps share one
Supabase backend.

## Repository layout

- `web/` — Web app: React 19 + TanStack Start (SSR) + Vite + Tailwind v4.
  Run: `cd web && bun install && bun run dev` (defaults to `:8080`).
- `mobile/` — Mobile app: React Native + Expo SDK 57 (expo-router).
  Run: `cd mobile && npm install && npx expo start`.
- `supabase/` — Shared backend: SQL migrations (`supabase/migrations/`) and
  edge functions (`supabase/functions/`).

## Conventions

- The two apps are **separate folders, side by side** — each has its own
  `package.json` and lockfile. Don't nest one inside the other.
- Database schema changes go in `supabase/migrations/` (timestamped SQL) and
  must be mirrored into the type files (`web/src/integrations/supabase/types.ts`
  and `mobile/src/lib/db-types.ts`).
- Server-only code in `web/` lives under `src/lib/server/**` or in `.server.ts`
  modules — the Vite `importProtection` rule errors if it leaks into the client.
- Don't rewrite published git history (force-push, rebase, amend) — branches
  deployed to Vercel/EAS must stay in a working state.
