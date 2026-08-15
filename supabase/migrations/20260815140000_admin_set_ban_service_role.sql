-- Fix admin_set_ban for service-role callers + backfill the profiles mirror.
--
-- The web server action (web/src/lib/admin.ts adminBanUser/adminUnbanUser)
-- calls this RPC through the service-role client, which carries NO user JWT.
-- auth.uid() is therefore NULL, `has_role(NULL, 'admin')` is false, and the
-- RPC raised "admin role required" — so the real ban (auth.users.banned_until,
-- enforced by GoTrue) was written but the profiles display mirror never was.
-- Result: banned users stayed logged-out (correct) but the admin list showed
-- "Suspend" forever (wrong), because it reads profiles.banned_until.
--
-- The mobile app calls the same RPC from the admin's own JWT (auth.uid() set)
-- and was unaffected.
--
-- Fix: accept service_role callers outright (they're trusted by definition);
-- user-issued calls must still prove the admin role. `IS DISTINCT FROM` keeps
-- NULL-role (unauthenticated) callers inside the check, which rejects them.
-- Safe to re-run: CREATE OR REPLACE + idempotent WHERE clause.

CREATE OR REPLACE FUNCTION public.admin_set_ban(
  _user_id uuid,
  _until   timestamptz,
  _reason  text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF _user_id IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'admin role required';
    END IF;
    IF _user_id = auth.uid() THEN
      RAISE EXCEPTION 'admins cannot ban themselves';
    END IF;
  END IF;

  -- Real enforcement: GoTrue rejects tokens while banned_until is in the future.
  UPDATE auth.users SET banned_until = _until WHERE id = _user_id;

  -- Display mirror for the admin list (auth.users isn't reachable via PostgREST).
  UPDATE public.profiles
     SET banned_until = _until,
         ban_reason   = CASE WHEN _until IS NULL THEN NULL ELSE _reason END
   WHERE id = _user_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_ban(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(uuid, timestamptz, text) TO authenticated, service_role;

-- Backfill: bans issued before this fix wrote auth.users.banned_until but never
-- mirrored to profiles, so the admin list couldn't show (or lift) them.
UPDATE public.profiles p
   SET banned_until = u.banned_until
  FROM auth.users u
 WHERE u.id = p.id
   AND u.banned_until IS NOT NULL
   AND p.banned_until IS NULL;
