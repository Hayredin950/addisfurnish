# Auth email delivery (Brevo + Supabase)

How AddisFurnish sends signup-confirmation and password-reset emails, and how
to set it up again from scratch (new environment, new project, or after a
provider change) in one command instead of the long debugging session it took
the first time.

## Why this exists (the failure we fixed)

The out-of-the-box path looked correct but never delivered:

1. **Wrong SMTP username** — Supabase's SMTP settings must use Brevo's relay
   login (`xxxxx@smtp-brevo.com`), **not** the Gmail account address. Brevo
   replies `535` otherwise.
2. **Wrong port** — it had been set to `582`/`586`; Brevo wants `465` (SSL) or
   `587` (STARTTLS).
3. **Gmail drops the default template** — the default templates embed a link
   to `{{ .ConfirmationURL }}` on the `*.supabase.co` domain, which Gmail
   silently discards (never even reaches spam). Token-only emails arrive.
4. **GoTrue's own SMTP client is unreliable here** — even with everything
   correct, emails GoTrue sends through `gomail.v2 → smtp-relay.brevo.com`
   complete the SMTP conversation but never reach Gmail inboxes, while the
   exact same content sent with other SMTP clients (nodemailer, Python
   smtplib) arrives every time. The platform-level fix: intercept GoTrue's
   mail with a **send-email hook** and deliver it ourselves.

## Architecture

```
App sign-up / password reset
  └─ Supabase GoTrue ── render 6-digit {{ .Token }} template
       └─ send-email hook  ──>  edge function: send-mail (nodemailer)
            └─ Brevo SMTP relay (465)  ──>  recipient inbox ✅
```

- `supabase/functions/send-mail/index.ts` — the hook. Reads credentials from
  project secrets, sends with nodemailer, tolerates both payload shapes GoTrue
  has used (`email.*` and `email_data.*`), renders the code email itself if
  GoTrue didn't provide content.
- `supabase/scripts/setup-email.sh` — applies every configuration step below
  through the Supabase Management API.

## One-command setup

```bash
cd supabase/scripts

SUPABASE_ACCESS_TOKEN=sbp_... \
SUPABASE_PROJECT_REF=<20-char ref> \
BREVO_SMTP_USER=xxxxx@smtp-brevo.com \
BREVO_SMTP_KEY=xsmtpsib-... \
./setup-email.sh
```

It is idempotent and sets:

1. Project secrets `BREVO_SMTP_HOST/PORT/USER/KEY/SENDER/SENDER_NAME`
2. Token-only **Confirm signup** and **Reset password** templates
   (`{{ .Token }}`, no `{{ .ConfirmationURL }}`), friendly subjects
3. OTP length `6` (matches the web/mobile code inputs) and a raised email
   rate limit
4. The `send-mail` edge function (deployed from the repo copy)
5. The send-email hook pointing at that function

Optional env: `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SENDER`,
`BREVO_SENDER_NAME`, `OTP_LENGTH`, `EMAIL_RATE_LIMIT`.

## Manual fallback (no API token)

Everything the script does is also reachable from the Supabase dashboard:

1. **Project Settings → Secrets** — add `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`,
   `BREVO_SMTP_USER`, `BREVO_SMTP_KEY`, `BREVO_SENDER`, `BREVO_SENDER_NAME`.
2. **Project Settings → Functions** — create function `send-mail`, copy
   `supabase/functions/send-mail/index.ts`, `verify_jwt: off`.
3. **Authentication → Emails → Templates** — paste the token-only bodies:
   - Confirm signup: `<h1 style="letter-spacing:8px;font-size:36px;">{{ .Token }}</h1>`
   - Reset password: same `{{ .Token }}` body. Remove `{{ .ConfirmationURL }}`.
4. **Authentication → Hooks** — enable **Send email hook** → URL
   `https://<ref>.supabase.co/functions/v1/send-mail`.
5. **Authentication → SMTP Settings** — host `smtp-relay.brevo.com`, port
   `465`, username = Brevo relay login, password = Brevo SMTP key, sender =
   a Brevo-verified address.

## Testing after setup

1. Trigger a password reset from the app (or `POST /auth/v1/recover` with the
   user's email, `apikey` = service role key).
2. Expect a **"Reset Your Password"** email with a 6-digit code in the inbox.
   First sends from a new sender may land in spam once — that's normal.
3. Sign up with a fresh email → the code-entry screen appears → the code email
   arrives → entering it signs the user in.

## Operational notes

- **Rotating the Brevo key**: Brevo → SMTP & API → regenerate the key, then
  update the `BREVO_SMTP_KEY` secret in Supabase (Project Settings → Secrets).
  Re-run `setup-email.sh` if you want everything re-verified.
- **Shared Brevo account**: AddisFurnish currently uses a friend's Brevo
  account. Its free-plan daily quota, sender, and any future key rotation
  affect us. For production, get your own Brevo account and a real domain
  (`noreply@addisfurnish.com` with SPF/DKIM) — sender address and domain
  deliverability improve and the friend's account is no longer a dependency.
- **Toggling email confirmation**: email verification is ON by default now
  that delivery works. To allow instant signup without email (e.g. for
  testing), set `mailer_autoconfirm: true` in Authentication → Sign In /
  Providers → Email → "Confirm email" off.
