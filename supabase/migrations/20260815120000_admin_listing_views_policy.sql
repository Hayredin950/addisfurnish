-- ── Admin read access to listing_views ───────────────────────────────────
-- The admin Stats trend chart counts views per day. listing_views is
-- owner-only by RLS, so a client-side admin query would undercount. Admins
-- get read access; everyone else keeps the owner-scoped policy.
CREATE POLICY "admins read all listing views" ON public.listing_views
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
