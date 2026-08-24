-- ── Business rules (items 36-38) + admin email-change tooling (item 43) ───
--
-- Everything here is enforced in the database, not just hidden in the UI: the
-- apps are two independent clients (web + Expo) and both talk straight to
-- PostgREST, so a rule that lives only in a component is not a rule.
--
-- 1. No self-dealing: you cannot offer on, review, or report your own listing
--    or yourself. Self-chat was already blocked in 20260803120000; these are
--    the three siblings that were missed.
-- 2. Admins cannot file reports — they are the ones who resolve them, so
--    authoring one puts the same person on both sides of the case.
-- 3. Email changes: an admin RPC that can set any user's email (audited), and
--    a request queue so a user can ask for the change instead.

-- ── Helper: does this user own this listing? ──────────────────────────────
-- SECURITY DEFINER on purpose. Used inside RLS WITH CHECK clauses, where a
-- plain subquery would be filtered by the *caller's* view of `listings` — an
-- inactive or hidden listing would fall out of the subquery and the guard
-- would silently pass.
CREATE OR REPLACE FUNCTION public.is_listing_owner(_listing_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = _listing_id AND l.seller_id = _user_id
  );
$$;
COMMENT ON FUNCTION public.is_listing_owner(uuid, uuid) IS
  'True when _user_id is the seller of _listing_id. For RLS self-dealing guards.';
REVOKE ALL ON FUNCTION public.is_listing_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_listing_owner(uuid, uuid) TO authenticated;

-- ── 1a. Offers: no offering on your own listing ──────────────────────────
-- Verified against live data before adding the constraint: 0 of 6 rows have
-- buyer_id = seller_id, so this validates without touching existing offers.
ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_no_self_offer;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_no_self_offer CHECK (buyer_id <> seller_id);

DROP POLICY IF EXISTS "buyer creates offer" ON public.offers;
CREATE POLICY "buyer creates offer" ON public.offers FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND buyer_id <> seller_id
    -- seller_id was previously caller-supplied and unchecked, so an offer
    -- could name anyone as the seller. It must be the listing's actual owner.
    AND public.is_listing_owner(listing_id, seller_id)
  );

-- ── 1b. Reviews: no reviewing your own shop ──────────────────────────────
-- Verified live: 0 of 8 rows have author_id = seller_id.
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_no_self_review;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_no_self_review CHECK (author_id <> seller_id);

DROP POLICY IF EXISTS "own review write" ON public.reviews;
CREATE POLICY "own review write" ON public.reviews FOR ALL TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid() AND author_id <> seller_id);

-- ── 2. Reports: not on yourself, and not by a moderator ──────────────────
-- No CHECK constraint here: a listing report carries only listing_id, so
-- "is this mine?" needs a lookup, and two pre-existing rows (both admin
-- self-reports left over from testing) would fail validation. The policy
-- governs new inserts and leaves the audit history intact.
DROP POLICY IF EXISTS "reporter creates report" ON public.reports;
CREATE POLICY "reporter creates report" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    -- Admins resolve reports; filing one puts them on both sides of the case.
    AND NOT public.has_role(auth.uid(), 'admin')
    AND (reported_user_id IS NULL OR reported_user_id <> auth.uid())
    AND (listing_id IS NULL OR NOT public.is_listing_owner(listing_id, auth.uid()))
  );

-- ── 3. Email changes ─────────────────────────────────────────────────────
-- Both apps keep the email field read-only, because the address lives in
-- auth.users and no client may write there. Two supported paths:
--
--   a) The user files a request, an admin approves it (this table = queue).
--   b) An admin changes an address directly (this table = audit trail).
--
-- Either way a row lands here, so "who changed this address, when, and why"
-- always has an answer.
CREATE TABLE IF NOT EXISTS public.email_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_email text,
  new_email text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'rejected', 'applied')),
  -- Who created the row: the user themselves, or the acting admin.
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_change_requests_status_idx
  ON public.email_change_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS email_change_requests_user_idx
  ON public.email_change_requests (user_id, created_at DESC);

-- One open request per user, so the queue cannot be flooded.
CREATE UNIQUE INDEX IF NOT EXISTS email_change_requests_one_pending_idx
  ON public.email_change_requests (user_id) WHERE status = 'pending';

GRANT SELECT ON public.email_change_requests TO authenticated;
GRANT ALL ON public.email_change_requests TO service_role;
ALTER TABLE public.email_change_requests ENABLE ROW LEVEL SECURITY;

-- Read: your own requests, or everything if you moderate. No INSERT/UPDATE
-- policy at all — every write goes through the RPCs below, which is what lets
-- them own the auth.users side effect.
CREATE POLICY "own or admin reads email changes" ON public.email_change_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ── Internal: actually move the address in auth.users ─────────────────────
-- Not callable by any client role. The two admin RPCs below are SECURITY
-- DEFINER and run as the owner, so they can reach it; `authenticated` cannot.
CREATE OR REPLACE FUNCTION public.internal_apply_email_change(_user_id uuid, _new_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  _email text := lower(btrim(_new_email));
BEGIN
  UPDATE auth.users
     SET email = _email,
         email_change = '',
         -- An address confirmed before the change stays confirmed after it:
         -- the admin is vouching for the new one. Clearing this would lock the
         -- user out of password login instead of merely re-verifying them.
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at = now()
   WHERE id = _user_id;

  -- GoTrue resolves a login through auth.identities, not auth.users.email
  -- alone, so the email identity has to move with it or sign-in breaks.
  UPDATE auth.identities
     SET identity_data = identity_data || jsonb_build_object('email', _email),
         updated_at = now()
   WHERE user_id = _user_id AND provider = 'email';
END; $$;
REVOKE ALL ON FUNCTION public.internal_apply_email_change(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ── Internal: shared validation ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.internal_check_new_email(_user_id uuid, _new_email text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  _email text := lower(btrim(COALESCE(_new_email, '')));
BEGIN
  IF _email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN 'invalid_email';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id AND lower(email) = _email) THEN
    RETURN 'unchanged';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = _email AND id <> _user_id) THEN
    RETURN 'email_taken';
  END IF;
  RETURN NULL;  -- ok
END; $$;
REVOKE ALL ON FUNCTION public.internal_check_new_email(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ── User-facing: ask an admin to change my email ─────────────────────────
CREATE OR REPLACE FUNCTION public.request_email_change(_new_email text, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  _me uuid := auth.uid();
  _problem text;
  _old_email text;
  _name text;
  _admin uuid;
BEGIN
  IF _me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  _problem := public.internal_check_new_email(_me, _new_email);
  IF _problem IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', _problem);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.email_change_requests
    WHERE user_id = _me AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_pending');
  END IF;

  SELECT email INTO _old_email FROM auth.users WHERE id = _me;
  SELECT full_name INTO _name FROM public.profiles WHERE id = _me;

  INSERT INTO public.email_change_requests
    (user_id, old_email, new_email, reason, requested_by)
  VALUES (_me, _old_email, lower(btrim(_new_email)), nullif(btrim(COALESCE(_reason, '')), ''), _me);

  -- Put it in front of the moderators. Direct insert rather than
  -- admin_notify_user(), which is gated on the *caller* being an admin.
  FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, type, payload)
    VALUES (_admin, 'email_change_requested', jsonb_build_object(
      'name', COALESCE(_name, 'A user'),
      'newEmail', lower(btrim(_new_email))
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.request_email_change(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_email_change(text, text) TO authenticated;

-- ── Admin: approve or reject a queued request ────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_review_email_change(
  _request_id uuid,
  _approve boolean,
  _reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  _me uuid := auth.uid();
  _req public.email_change_requests%ROWTYPE;
  _problem text;
BEGIN
  IF _me IS NULL OR NOT public.has_role(_me, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin');
  END IF;

  SELECT * INTO _req FROM public.email_change_requests WHERE id = _request_id;
  IF _req.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF _req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_reviewed');
  END IF;

  IF _approve THEN
    -- Re-validate at approval time: the address may have been claimed while
    -- the request sat in the queue.
    _problem := public.internal_check_new_email(_req.user_id, _req.new_email);
    IF _problem IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', _problem);
    END IF;
    PERFORM public.internal_apply_email_change(_req.user_id, _req.new_email);
  END IF;

  UPDATE public.email_change_requests
     SET status = CASE WHEN _approve THEN 'applied' ELSE 'rejected' END,
         reviewed_by = _me,
         reviewed_at = now(),
         rejection_reason = CASE
           WHEN _approve THEN NULL
           ELSE nullif(btrim(COALESCE(_reason, '')), '')
         END
   WHERE id = _req.id;

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (
    _req.user_id,
    CASE WHEN _approve THEN 'email_change_approved' ELSE 'email_change_rejected' END,
    jsonb_build_object(
      'newEmail', _req.new_email,
      'reason', COALESCE(nullif(btrim(COALESCE(_reason, '')), ''), '')
    )
  );

  RETURN jsonb_build_object('ok', true, 'applied', _approve);
END; $$;
REVOKE ALL ON FUNCTION public.admin_review_email_change(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_email_change(uuid, boolean, text) TO authenticated;

-- ── Admin: change an address directly (no request needed) ─────────────────
-- Records an 'applied' row so the direct path is audited exactly like the
-- queued one.
CREATE OR REPLACE FUNCTION public.admin_set_user_email(
  _user_id uuid,
  _new_email text,
  _reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  _me uuid := auth.uid();
  _problem text;
  _old_email text;
BEGIN
  IF _me IS NULL OR NOT public.has_role(_me, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin');
  END IF;
  IF _user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  _problem := public.internal_check_new_email(_user_id, _new_email);
  IF _problem IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', _problem);
  END IF;

  SELECT email INTO _old_email FROM auth.users WHERE id = _user_id;
  PERFORM public.internal_apply_email_change(_user_id, _new_email);

  -- Any request the user had open is now moot. It only counts as "applied" if
  -- the admin set the very address that was asked for; otherwise saying
  -- "applied" would claim an address was set that never was.
  UPDATE public.email_change_requests
     SET status = CASE
           WHEN lower(new_email) = lower(btrim(_new_email)) THEN 'applied'
           ELSE 'rejected'
         END,
         rejection_reason = CASE
           WHEN lower(new_email) = lower(btrim(_new_email)) THEN NULL
           ELSE 'Superseded by a direct admin change'
         END,
         reviewed_by = _me,
         reviewed_at = now()
   WHERE user_id = _user_id AND status = 'pending';

  INSERT INTO public.email_change_requests
    (user_id, old_email, new_email, reason, status, requested_by, reviewed_by, reviewed_at)
  VALUES (
    _user_id, _old_email, lower(btrim(_new_email)),
    nullif(btrim(COALESCE(_reason, '')), ''), 'applied', _me, _me, now()
  );

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (_user_id, 'email_change_approved',
          jsonb_build_object('newEmail', lower(btrim(_new_email)), 'reason', ''));

  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_user_email(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_email(uuid, text, text) TO authenticated;
