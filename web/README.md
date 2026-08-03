# SuqBet Web

The web marketplace for SuqBet — React + TanStack Start (SSR) + Vite, with
Tailwind + shadcn/ui components and a Supabase backend shared with the
`mobile/` app.

## Run locally

```sh
cd web
npm i        # or: bun install
npm run dev  # → http://localhost:8080
```

Environment: copy the required `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`
(and `VITE_`-prefixed variants) into `web/.env`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with SSR + HMR |
| `npm run build` | Production build (nitro/cloudflare output) |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the production build |

The shared backend lives in `../supabase/` (migrations + edge functions) —
both apps use the same Supabase project.
