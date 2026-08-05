-- ═══════════════════════════════════════════════════════════════════════════
-- Phone verification via the Telegram bot
-- ═══════════════════════════════════════════════════════════════════════════
-- Phone *login* (SMS OTP) is gone — it needed a paid SMS gateway that was
-- never wired, so codes only ever reached the server console. Phone
-- verification now runs through the existing bot: the user shares their
-- contact with Telegram's request_contact button, the bot checks that the
-- shared contact really is the sender's own (contact.user_id == from.id) and
-- that the number matches the one being verified, and only then issues a code.
--
-- Three pieces here:
--   1. one number → one account, enforced in the database
--   2. pending-verification state the bot can read across two webhook calls
--   3. mint_phone_verify_token(), the RPC the profile page calls
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. One number, one account ───────────────────────────────────────────
-- Partial so the many profiles with no phone yet stay legal — NULLs are not
-- distinct under a plain UNIQUE index in older Postgres, and being explicit
-- documents the intent either way. Verified zero duplicates before writing
-- this; the index creation fails outright if any appear.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key
  ON public.profiles (phone)
  WHERE phone IS NOT NULL;

-- ── 2. Pending-verification state ────────────────────────────────────────
-- The flow spans two separate webhook invocations (/start, then the shared
-- contact) and edge functions are stateless — they scale to zero, so an
-- in-memory map would be empty on a cold start and verification would fail
-- silently. The pending state therefore lives here.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verify_token text,
  ADD COLUMN IF NOT EXISTS phone_verify_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verify_phone text,
  ADD COLUMN IF NOT EXISTS phone_verify_chat_id text;

COMMENT ON COLUMN public.profiles.phone_verify_phone IS
  'Normalised E.164 number this verification is for. The bot compares the '
  'shared contact against it — a mismatch means the user is trying to verify '
  'a number their Telegram account does not own.';

COMMENT ON COLUMN public.profiles.phone_verify_chat_id IS
  'Chat that ran /start with the verify token, awaiting a shared contact. '
  'Deliberately NOT telegram_chat_id: that column means "linked for '
  'notifications" and must not be set until the contact check passes.';

-- Both looked up by the bot on every relevant update.
CREATE INDEX IF NOT EXISTS profiles_phone_verify_token_idx
  ON public.profiles (phone_verify_token)
  WHERE phone_verify_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_phone_verify_chat_idx
  ON public.profiles (phone_verify_chat_id)
  WHERE phone_verify_chat_id IS NOT NULL;

-- ── 3. mint_phone_verify_token(_phone) ───────────────────────────────────
-- Same shape as mint_telegram_link_token() above, plus the number being
-- verified. The caller normalises to E.164 first (web/src/lib/otp.ts
-- normalizePhone) and this rejects anything that does not look like one, so
-- the bot can compare against it with a plain string equality.
--
-- Returns NULL when the number is already verified on another account, which
-- the UI reports as "that number is already in use" — better than letting the
-- unique index above raise a 500 at the very end of the flow.
CREATE OR REPLACE FUNCTION public.mint_phone_verify_token(_phone text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _token text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF _phone IS NULL OR _phone !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN NULL; END IF;

  -- Taken by someone else? Stop here rather than at the unique index.
  IF EXISTS (
    SELECT 1 FROM public.profiles
     WHERE phone = _phone AND id <> auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  _token := replace(gen_random_uuid()::text, '-', '');
  UPDATE public.profiles
     SET phone_verify_token = _token,
         phone_verify_token_expires_at = now() + interval '15 minutes',
         phone_verify_phone = _phone,
         phone_verify_chat_id = NULL  -- a fresh token invalidates any half-done run
   WHERE id = auth.uid();
  RETURN _token;
END; $$;
REVOKE ALL ON FUNCTION public.mint_phone_verify_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mint_phone_verify_token(text) TO authenticated;

-- ── 4. Clear pending state on unlink ─────────────────────────────────────
-- unlink_telegram() predates these columns; leaving a pending verification
-- behind after a disconnect would let a stale chat id finish the flow.
CREATE OR REPLACE FUNCTION public.unlink_telegram()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.profiles
     SET telegram_chat_id = NULL,
         telegram_link_token = NULL,
         telegram_link_token_expires_at = NULL,
         telegram_linked_at = NULL,
         phone_verify_token = NULL,
         phone_verify_token_expires_at = NULL,
         phone_verify_phone = NULL,
         phone_verify_chat_id = NULL
   WHERE id = auth.uid();
END; $$;
REVOKE ALL ON FUNCTION public.unlink_telegram() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_telegram() TO authenticated;
