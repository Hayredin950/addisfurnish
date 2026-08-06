-- ═══════════════════════════════════════════════════════════════════════════
-- Mobile profile parity
-- ═══════════════════════════════════════════════════════════════════════════
-- Two things the mobile app needs that the web server actions could do but a
-- phone client could not:
--   1. a `bio` column (the web profile form doesn't have one yet either, so
--      this adds it for both apps)
--   2. verify_phone_otp(), a client-safe twin of the web's server-side check:
--      the web reads the server-only `phone_otps` table with the service role;
--      a mobile client cannot, so this SECURITY DEFINER RPC performs the exact
--      same check for the *caller's own* rows.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text;

COMMENT ON COLUMN public.profiles.bio IS 'Short personal/shop intro shown on the profile.';

-- ── verify_phone_otp(_phone, _code) ───────────────────────────────────────
-- Mirrors web/src/lib/otp.ts verifyPhoneOtp: takes the latest code minted for
-- this user + phone, checks expiry / attempts / match, and on success stamps
-- phone_verified_at and adopts the number as the profile contact.
--
-- phone_otps has RLS enabled with no policies, so this SECURITY DEFINER body
-- only works because its owner (postgres in the SQL editor) bypasses RLS.
-- Create it under a superuser/BYPASSRLS role or add a policy if that changes.
--
-- Returns a text status: 'ok' on success, otherwise 'no_code' | 'expired' |
-- 'too_many' | 'wrong_code' | 'taken' | 'server_error' | 'auth'.
CREATE OR REPLACE FUNCTION public.verify_phone_otp(_phone text, _code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.phone_otps%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'auth'; END IF;
  IF _phone IS NULL OR _phone !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN 'invalid_phone'; END IF;

  SELECT * INTO _row FROM public.phone_otps
   WHERE user_id = auth.uid() AND phone = _phone
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 'no_code'; END IF;
  IF _row.expires_at < now() THEN RETURN 'expired'; END IF;
  IF _row.attempts >= 5 THEN RETURN 'too_many'; END IF;

  IF _row.code IS DISTINCT FROM trim(_code) THEN
    UPDATE public.phone_otps
       SET attempts = _row.attempts + 1
     WHERE id = _row.id;
    RETURN 'wrong_code';
  END IF;

  -- The partial unique index on profiles(phone) is the last line of defence if
  -- the number was claimed between minting the token and arriving here.
  BEGIN
    UPDATE public.profiles
       SET phone_verified_at = now(), phone = _phone
     WHERE id = auth.uid();
  EXCEPTION WHEN unique_violation THEN
    RETURN 'taken';
  END;

  DELETE FROM public.phone_otps WHERE user_id = auth.uid() AND phone = _phone;
  RETURN 'ok';
END; $$;
REVOKE ALL ON FUNCTION public.verify_phone_otp(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_phone_otp(text, text) TO authenticated;
