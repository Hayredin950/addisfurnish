-- AUTH & SELLER VERIFICATION (spec §3)
--  * seller_verification_documents: sellers submit ID/business-license documents
--  * verification_decisions: immutable admin audit trail (who/when/why)
--  * phone_otps: support passwordless registration/login (user_id nullable,
--    ip_address for per-IP rate limiting)
--  * admin_notify_user: admin-only notification RPC (bypasses the
--    conversation-thread guard on notify_user)

-- ── phone_otps: auth purpose (user may not exist yet) + IP rate limiting ──
ALTER TABLE public.phone_otps ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.phone_otps ADD COLUMN IF NOT EXISTS ip_address text;
CREATE INDEX IF NOT EXISTS phone_otps_phone_idx ON public.phone_otps (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_otps_ip_idx ON public.phone_otps (ip_address, created_at DESC);

-- ── Seller verification documents ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seller_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('national_id','business_license','other')),
  file_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS svd_status_idx ON public.seller_verification_documents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS svd_seller_idx ON public.seller_verification_documents (seller_id);
GRANT SELECT, INSERT ON public.seller_verification_documents TO authenticated;
GRANT ALL ON public.seller_verification_documents TO service_role;
ALTER TABLE public.seller_verification_documents ENABLE ROW LEVEL SECURITY;
-- Sellers can submit and view their own documents only.
CREATE POLICY "seller reads own documents" ON public.seller_verification_documents FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "seller submits documents" ON public.seller_verification_documents FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());
-- Admins review (approve/reject) documents.
CREATE POLICY "admin updates documents" ON public.seller_verification_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ── Audit trail: every admin verification decision ───────────────────────
CREATE TABLE IF NOT EXISTS public.verification_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.seller_verification_documents(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL CHECK (action IN ('approved','rejected')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_decisions_seller_idx
  ON public.verification_decisions (seller_id, created_at DESC);
GRANT SELECT, INSERT ON public.verification_decisions TO authenticated;
GRANT ALL ON public.verification_decisions TO service_role;
ALTER TABLE public.verification_decisions ENABLE ROW LEVEL SECURITY;
-- Only admins write or read the audit trail.
CREATE POLICY "admin reads decisions" ON public.verification_decisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin records decisions" ON public.verification_decisions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ── Admin notification RPC ───────────────────────────────────────────────
-- notify_user() only allows notifying someone you share a conversation or
-- callback thread with. Admins need a broader path (e.g. verification
-- decisions), so this one is gated on the admin role instead.
CREATE OR REPLACE FUNCTION public.admin_notify_user(_user_id uuid, _type text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (_user_id, _type, COALESCE(_payload, '{}'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.admin_notify_user(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_notify_user(uuid, text, jsonb) TO authenticated;

-- ── Private storage bucket for identity documents ───────────────────────
-- National IDs / licenses are sensitive: the bucket is private, readable only
-- by the owner and admins (signed URLs are generated through the app).
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-docs', 'verification-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "verif docs owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'verification-docs' AND owner = auth.uid());
CREATE POLICY "verif docs admin read" ON storage.objects FOR SELECT
  USING (bucket_id = 'verification-docs' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "verif docs owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND owner = auth.uid());
CREATE POLICY "verif docs owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'verification-docs' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'verification-docs' AND owner = auth.uid());
CREATE POLICY "verif docs owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'verification-docs' AND owner = auth.uid());

-- ── Demo: one pending verification document so the admin queue has content ─
INSERT INTO public.seller_verification_documents (seller_id, document_type, file_url, status)
VALUES
  ('22222222-2222-2222-2222-222222222202', 'business_license', 'demo/piassa-license.jpg', 'pending');
