# Brevo Email Kit — reusable across projects

Drop-in Brevo email setup that works in **any** TypeScript/Node.js project
(Node, Deno edge functions, Bun, React Native, Vercel, Cloudflare Workers).
Two send paths:

1. **Official SDK** (`@getbrevo/brevo`) — the Transactional Email API. Preferred:
   retries + timeouts built in, no SMTP ports to open, runs everywhere.
2. **SMTP relay** (nodemailer) — for when you need a plain SMTP client (e.g. a
   Supabase Auth "send email" hook, or existing mail infrastructure).

This folder is deliberately **project-agnostic**. The AddisFurnish-specific
wiring (Supabase send-email hook + one-shot `setup-email.sh`) lives in
`supabase/scripts/` — read it for the Supabase integration recipe; copy this
folder for everything else.

---

## 1. What you need from Brevo (3 credentials)

Create a free account at **https://app.brevo.com/** (200–300 emails/day free).

| # | Credential | Where to find it in Brevo | Looks like |
|---|---|---|---|
| 1 | **API key** (SDK path) | Dashboard → **SMTP & API → API Keys** → "Generate a new API key" | `xkeysib-...` |
| 2 | **SMTP relay login** (SMTP path) | Dashboard → **SMTP & API → SMTP settings** | `7f5a2b9c...@smtp-brevo.com` |
| 3 | **SMTP master key** (SMTP path) | Same SMTP settings page → "Master password" | `xsmtpsib-...` |

**Plus a verified sender address** (required by both paths):

- **Quick start / testing:** Settings → **Senders & IPs → Senders** → "Add a
  sender" → Brevo sends a confirmation email to that address; click it.
- **Production (recommended):** authenticate your own domain — Settings →
  **Senders & IPs → Domains** → Brevo shows you the SPF/DKIM records to add at
  your registrar. Then you can send from `noreply@yourdomain.com`.

> ⚠️ Common mistake (cost us a long debugging session in AddisFurnish): the
> SMTP **username** must be the relay login (`xxxxx@smtp-brevo.com`), **not**
> your account email address. Brevo replies `535` otherwise.

---

## 2. Environment variables

Everything the kit reads — see `.env.example` for a copy-paste template.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `BREVO_API_KEY` | SDK path | — | `xkeysib-...` from SMTP & API → API Keys |
| `BREVO_SMTP_USER` | SMTP path | — | relay login `xxxxx@smtp-brevo.com` |
| `BREVO_SMTP_KEY` | SMTP path | — | SMTP master key `xsmtpsib-...` |
| `BREVO_SMTP_HOST` | no | `smtp-relay.brevo.com` | only change if Brevo tells you to |
| `BREVO_SMTP_PORT` | no | `465` | `465` = implicit TLS, `587` = STARTTLS |
| `BREVO_SENDER` | yes | — | verified sender address (see §1) |
| `BREVO_SENDER_NAME` | no | your app name | shown as the "from" name |

Both paths need `BREVO_SENDER`. Pick the path, then fill only its credential.

---

## 3. How to fill the vars, per runtime

**Local dev / Node:**
```bash
cp .env.example .env        # fill in the values
npm i dotenv                # the examples load it via import "dotenv/config"
```

**Deno / Supabase edge functions:** the examples read `Deno.env.get(...)`.
For Supabase, set them as function secrets:

```bash
supabase secrets set BREVO_API_KEY=xkeysib-... BREVO_SENDER=you@yourdomain.com
# or dashboard → Project Settings → Edge Functions → Secrets
```

**Vercel:** Project → **Settings → Environment Variables** → add the same
names (both preview + production).

**Docker / CI:** pass them as standard environment variables; never commit
`.env` to git (it's gitignored by convention).

**Supabase Auth email (send-email hook):** copy
`supabase/functions/send-mail/index.ts` into your project and run the
one-shot `supabase/scripts/setup-email.sh` — both already read the same
`BREVO_SMTP_*` / `BREVO_SENDER*` variables and are idempotent.

---

## 4. Quick start

```bash
cd node
npm install
cp ../.env.example ../.env   # fill in BREVO_SENDER + your chosen path's key
npx tsx api-sdk.ts           # official SDK path
npx tsx smtp.ts              # SMTP path
```

Deno: `deno run --allow-env --allow-net deno/api-sdk.ts` (or paste the file
straight into a Supabase edge function).

---

## 5. Which path should I pick?

| | Official SDK (`@getbrevo/brevo`) | SMTP relay (nodemailer) |
|---|---|---|
| Setup | one API key | relay login + master key |
| Runs on | Node 18+, Deno, Bun, Workers, React Native | Node only (anything with SMTP) |
| Retries/timeouts | built in (default 2 retries, 60s timeout) | you implement them |
| Best for | new code, edge functions, webhooks | Supabase Auth hooks, legacy mail stacks |

Rule of thumb: **use the SDK unless something forces SMTP on you** (GoTrue's
send-email hook is the classic example — it hands you an SMTP-shaped payload).

---

## 6. Deliverability (learned the hard way in AddisFurnish)

- **Verify your sender/domain in Brevo** before sending anything real —
  unverified senders get rejected, and a gmail.com address relayed through
  Brevo fails SPF/DKIM and lands in spam. Use your own domain for production.
- Send **multipart text + HTML** (HTML-only is a spam signal), a clean
  Message-ID, and a Reply-To — the examples do all three.
- First send from a new sender may hit spam once; after that it's trained.

---

## 7. Files

```
brevo/
├── README.md          ← this file
├── .env.example       ← copy to .env and fill
└── node/
    ├── package.json   ← deps: @getbrevo/brevo, nodemailer, dotenv, tsx
    ├── api-sdk.ts     ← official SDK, sendTransactionalEmail
    └── smtp.ts        ← nodemailer → smtp-relay.brevo.com:465
└── deno/
    └── api-sdk.ts     ← same SDK via npm: specifier (edge functions)
```
