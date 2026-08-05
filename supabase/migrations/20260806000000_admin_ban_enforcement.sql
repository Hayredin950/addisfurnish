-- Make `admin_set_ban` actually enforce the suspension, not just mirror it.
--
-- The web app bans through the service role:
--     supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "12h" })
-- which writes `auth.users.banned_until` (GoTrue rejects that user's tokens).
-- The mobile app has no service-role client, so it can only call the
-- admin-gated RPC `admin_set_ban` — which previously wrote ONLY the
-- `profiles.banned_until` display mirror. A mobile "ban" therefore looked
-- effective in the admin list but never actually blocked the user.
--
-- This redefines the RPC (SECURITY DEFINER, admin-gated, same shape) to also
-- write `auth.users.banned_until` directly — the exact column GoTrue checks on
-- login and token refresh. The web path keeps working unchanged (it writes the
-- same value twice, which is idempotent).
--
-- Safe to re-run: CREATE OR REPLACE + idempotent WHERE clauses.

CREATE OR REPLACE FUNCTION public.admin_set_ban(
  _user_id uuid,
  _until   timestamptz,
  _reason  text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF _user_id IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'admins cannot ban themselves';
  END IF;

  -- Real enforcement: GoTrue rejects tokens while banned_until is in the future
  -- (this is what ban_duration on the admin API writes under the hood).
  UPDATE auth.users SET banned_until = _until WHERE id = _user_id;

  -- Display mirror for the admin list (auth.users isn't reachable via PostgREST).
  UPDATE public.profiles
     SET banned_until = _until,
         ban_reason   = CASE WHEN _until IS NULL THEN NULL ELSE _reason END
   WHERE id = _user_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_ban(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(uuid, timestamptz, text) TO authenticated, service_role;
