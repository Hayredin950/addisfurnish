-- Admin tooling: working session revocation, ban bookkeeping and a
-- report-resolution notification.
--
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1. Session revocation.
--
-- `auth.admin.signOut()` needs the target user's own JWT, which an admin never
-- holds, so "log out everywhere" always failed. Deleting the user's sessions
-- and refresh tokens is exactly what GoTrue does for a global logout.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_sessions(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF _user_id IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  -- refresh_tokens has no FK cascade from sessions in older GoTrue versions,
  -- so clear both explicitly.
  DELETE FROM auth.refresh_tokens WHERE user_id = _user_id::text;
  DELETE FROM auth.sessions       WHERE user_id = _user_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_revoke_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_sessions(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Ban bookkeeping.
--
-- auth.users.banned_until is not readable through PostgREST, so mirror the
-- state onto profiles for the admin list to show who is currently suspended.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_until timestamptz,
  ADD COLUMN IF NOT EXISTS ban_reason   text;

COMMENT ON COLUMN public.profiles.banned_until IS 'Mirror of auth.users.banned_until for admin display.';

CREATE OR REPLACE FUNCTION public.admin_set_ban(
  _user_id uuid,
  _until   timestamptz,
  _reason  text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'admins cannot ban themselves';
  END IF;

  UPDATE public.profiles
     SET banned_until = _until,
         ban_reason   = CASE WHEN _until IS NULL THEN NULL ELSE _reason END
   WHERE id = _user_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_ban(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(uuid, timestamptz, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Let admins read every profile.
--
-- The users/sellers management tab needs the full list; the existing policy
-- only exposes public seller fields.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin reads all profiles" ON public.profiles;
CREATE POLICY "admin reads all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin updates any profile" ON public.profiles;
CREATE POLICY "admin updates any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 4. Admins need to read every report (not just pending) and see the reporter
--    so resolving one can notify them.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status, created_at DESC);
