-- ── Admin platform-stats policies ─────────────────────────────────────────
-- The admin Stats tab now counts conversations and messages. Those tables are
-- participant-only by RLS, so a client-side admin query (running as the
-- logged-in admin, not the service role) would undercount. Admins get read
-- access; everyone else keeps the participant-scoped policies.
CREATE POLICY "admins read all conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins read all messages" ON public.messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
