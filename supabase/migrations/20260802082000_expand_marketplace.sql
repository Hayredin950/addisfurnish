-- EXPANDED MARKETPLACE SCHEMA
-- Adds: reports (trust & safety), notifications, recently_viewed, search_log,
-- profile/listing columns (i18n, Telegram, online status, WhatsApp/Telegram contacts).

-- ── Categories: Amharic names ─────────────────────────────────────────────
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name_am text;

UPDATE public.categories SET name_am = CASE slug
  WHEN 'living-room' THEN 'ሳሎን'
  WHEN 'bedroom' THEN 'መኝታ ክፍል'
  WHEN 'office' THEN 'ቢሮ'
  WHEN 'kitchen-dining' THEN 'ኩሽና እና መመገቢያ'
  WHEN 'outdoor' THEN 'ከቤት ውጭ'
  WHEN 'storage' THEN 'ማከማቻ'
  WHEN 'sofas' THEN 'ሶፋዎች'
  WHEN 'coffee-tables' THEN 'የቡና ጠረጴዛዎች'
  WHEN 'tv-stands' THEN 'የቲቪ መደርደሪያ'
  WHEN 'beds' THEN 'አልጋዎች'
  WHEN 'wardrobes' THEN 'ቁም ሳጥኖች'
  WHEN 'desks' THEN 'ጠረጴዛዎች'
  WHEN 'office-chairs' THEN 'የቢሮ ወንበሮች'
  WHEN 'dining-sets' THEN 'የመመገቢያ ስብስቦች'
  WHEN 'garden-chairs' THEN 'የአትክልት ወንበሮች'
  WHEN 'shelves' THEN 'መደርደሪያዎች'
END
WHERE slug IS NOT NULL AND name_am IS NULL;

-- ── Profiles: online status, contacts, i18n, Telegram linking ────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS telegram text,
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS telegram_chat_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_link_token text;

-- ── Listings: Telegram channel post dedupe ────────────────────────────────
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS telegram_posted_at timestamptz;

-- ── Reviews: author name join (FK to profiles) ────────────────────────────
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_author_id_fkey;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_author_id_fkey FOREIGN KEY (author_id)
  REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Admins may verify/moderate profiles (e.g. approve seller verification).
CREATE POLICY "admins manage profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ── Reports (report listing / report user) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (listing_id IS NOT NULL OR reported_user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status, created_at DESC);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reporter creates report" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reporter or admin read report" ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin updates report" ON public.reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ── Notifications (in-app center) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Inserts happen through notify_user() (SECURITY DEFINER) so users can notify each other.
-- Abuse guard: you may only notify yourself or someone you share a
-- conversation/callback thread with, so a scripted client can't spam everyone.
CREATE OR REPLACE FUNCTION public.notify_user(_user_id uuid, _type text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _user_id IS NULL OR _caller IS NULL THEN RETURN; END IF;
  IF _caller <> _user_id AND NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.buyer_id = _caller AND c.seller_id = _user_id)
       OR (c.seller_id = _caller AND c.buyer_id = _user_id)
    UNION
    SELECT 1 FROM public.callback_requests cb
    WHERE (cb.buyer_id = _caller AND cb.seller_id = _user_id)
       OR (cb.seller_id = _caller AND cb.buyer_id = _user_id)
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (_user_id, _type, COALESCE(_payload, '{}'::jsonb));
END; $$;

-- ── Recently viewed ("Seen this") ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recently_viewed (
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recently_viewed TO authenticated;
GRANT ALL ON public.recently_viewed TO service_role;
ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recently viewed" ON public.recently_viewed FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Search log (trending / popular searches) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.search_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_log_query_idx ON public.search_log (query);
ALTER TABLE public.search_log ADD CONSTRAINT search_log_query_len CHECK (length(query) BETWEEN 1 AND 60);
GRANT SELECT, INSERT ON public.search_log TO anon, authenticated;
GRANT ALL ON public.search_log TO service_role;
ALTER TABLE public.search_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "search log append" ON public.search_log FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "search log read" ON public.search_log FOR SELECT TO anon, authenticated USING (true);

-- ── Combined view recording: bump counter + track recently viewed ─────────
CREATE OR REPLACE FUNCTION public.record_listing_view(_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.listings SET view_count = view_count + 1 WHERE id = _listing_id;
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.recently_viewed (user_id, listing_id) VALUES (auth.uid(), _listing_id)
    ON CONFLICT (user_id, listing_id) DO UPDATE SET viewed_at = now();
  END IF;
END; $$;

-- ── Function grants hardening ─────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.record_listing_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_listing_view(uuid) TO anon, authenticated;

-- ── Demo data: buyer profile, reviews, online status, contacts, search log ──
INSERT INTO public.profiles (id, full_name, phone, city)
VALUES ('22222222-2222-2222-2222-222222222203','Hanna Girma','+251913445566','Addis Ababa')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.reviews (seller_id, author_id, rating, comment)
VALUES
  ('22222222-2222-2222-2222-222222222201','22222222-2222-2222-2222-222222222202',5,
   'Very honest seller — the sofa was exactly as described and they helped load it into the car.'),
  ('22222222-2222-2222-2222-222222222201','22222222-2222-2222-2222-222222222203',4,
   'Good communication, price matched the photos. Slight delay but worth it.')
ON CONFLICT (seller_id, author_id) DO NOTHING;

UPDATE public.profiles SET
  is_online = true,
  whatsapp = '+251911223344',
  telegram = 'selam_home'
WHERE id = '22222222-2222-2222-2222-222222222201';

UPDATE public.profiles SET
  is_online = false,
  telegram = 'piassa_2nd'
WHERE id = '22222222-2222-2222-2222-222222222202';

INSERT INTO public.search_log (query) VALUES
  ('sofa'), ('bed'), ('dining set'), ('office chair'), ('wardrobe'), ('sofa'), ('coffee table');
