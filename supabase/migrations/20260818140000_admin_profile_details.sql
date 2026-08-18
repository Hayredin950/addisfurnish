-- ── Admin: profile details (email + contact info) ─────────────────────────
-- Exposes each account's email (auth.users) plus the full contact / shop
-- details (profiles) to admins. auth.users is not reachable through
-- PostgREST from a profiles query, so we provide a SECURITY DEFINER RPC
-- that joins it — the same pattern as the other admin RPCs in this repo.
-- The function verifies the caller is an admin before returning anything,
-- and only admins are granted EXECUTE.

-- Clean up the earlier view attempt (views can't have RLS on PG 14).
DROP VIEW IF EXISTS public.admin_profile_details;

CREATE OR REPLACE FUNCTION public.admin_get_profile_details(_is_seller boolean DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _requester uuid := auth.uid();
  r record;
BEGIN
  IF _requester IS NULL OR NOT public.has_role(_requester, 'admin') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT
      p.id,
      p.full_name,
      p.avatar_url,
      p.bio,
      p.city,
      p.phone,
      p.phone_verified_at,
      p.whatsapp,
      p.preferred_language,
      p.is_seller,
      p.verified,
      p.is_super_admin,
      p.created_at,
      p.updated_at,
      p.last_seen,
      p.is_online,
      p.banned_until,
      p.ban_reason,
      p.shop_name,
      p.shop_slug,
      p.shop_logo_url,
      p.shop_description,
      p.shop_address,
      p.registration_number,
      p.telegram,
      p.telegram_blocked,
      p.telegram_linked_at,
      au.email,
      au.email_confirmed_at,
      au.last_sign_in_at,
      (SELECT coalesce(jsonb_agg(ur.role ORDER BY ur.role), '[]'::jsonb)
         FROM public.user_roles ur
         WHERE ur.user_id = p.id) AS role_names
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    WHERE (_is_seller IS NULL OR p.is_seller = _is_seller)
    ORDER BY p.created_at DESC
  LOOP
    RETURN NEXT to_jsonb(r);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_profile_details(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_details(boolean) TO authenticated;
