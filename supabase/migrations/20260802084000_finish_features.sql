-- FINAL FEATURE SET (spec §2–§12 completion)
--  * listings: discount expiry, map coordinates, delivery info
--  * profiles: business registration / license number
--  * listing_views: per-day view logging (dashboard performance chart)
--  * saved_searches + trigger: alerts when a matching new listing appears
--  * buyer_preferences: Telegram bot filtering (categories, price, cities)
--  * favorites price-drop trigger: notify saved-item owners on price cuts

-- ── Listings: discount expiry, coordinates, delivery ────────────────────
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS discount_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_offered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2);

-- ── Profiles: registration / license number (credibility, optional) ─────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS registration_number text;

-- ── View logging (spec `listing_views` table) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_views_listing_idx ON public.listing_views (listing_id, created_at);
GRANT SELECT ON public.listing_views TO authenticated;
GRANT ALL ON public.listing_views TO service_role;
ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;
-- Sellers can read view logs for their own listings (performance chart).
CREATE POLICY "sellers read own listing views" ON public.listing_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid()));
-- Inserts happen through record_listing_view() (SECURITY DEFINER) only.

CREATE OR REPLACE FUNCTION public.record_listing_view(_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.listings SET view_count = view_count + 1 WHERE id = _listing_id;
  INSERT INTO public.listing_views (listing_id, user_id) VALUES (_listing_id, auth.uid());
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.recently_viewed (user_id, listing_id) VALUES (auth.uid(), _listing_id)
    ON CONFLICT (user_id, listing_id) DO UPDATE SET viewed_at = now();
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.record_listing_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_listing_view(uuid) TO anon, authenticated;

-- ── Saved searches (with alerts) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  query text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_searches_user_idx ON public.saved_searches (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.saved_searches TO authenticated;
GRANT ALL ON public.saved_searches TO service_role;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own saved searches" ON public.saved_searches FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Notify owners of saved searches when a new listing matches (runs as owner,
-- so it bypasses RLS safely).
CREATE OR REPLACE FUNCTION public.notify_saved_search_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  _q text; _cat text; _min numeric; _max numeric;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  FOR s IN SELECT id, user_id, query, filters FROM public.saved_searches LOOP
    _q := lower(COALESCE(s.query, ''));
    _cat := COALESCE((s.filters ->> 'category'), '');
    _min := COALESCE(NULLIF(s.filters ->> 'min', '')::numeric, 0);
    _max := COALESCE(NULLIF(s.filters ->> 'max', '')::numeric, 0);
    IF (_q = '' OR lower(NEW.title) LIKE '%' || _q || '%' OR lower(NEW.description) LIKE '%' || _q || '%')
      AND (_cat = '' OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = NEW.category_id AND c.slug = _cat))
      AND (NEW.price >= _min)
      AND (_max = 0 OR NEW.price <= _max)
    THEN
      INSERT INTO public.notifications (user_id, type, payload)
      VALUES (s.user_id, 'saved_search_match',
              jsonb_build_object('title', NEW.title, 'listingId', NEW.id, 'query', s.query));
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER saved_search_matches AFTER INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.notify_saved_search_matches();

-- ── Price-drop alerts for saved (favorited) items ───────────────────────
CREATE OR REPLACE FUNCTION public.notify_favorites_price_drop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.price IS DISTINCT FROM NEW.price AND NEW.price < OLD.price THEN
    INSERT INTO public.notifications (user_id, type, payload)
    SELECT user_id, 'price_drop',
           jsonb_build_object('title', NEW.title, 'listingId', NEW.id,
                              'oldPrice', OLD.price, 'newPrice', NEW.price)
    FROM public.favorites WHERE listing_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER favorites_price_drop AFTER UPDATE OF price ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.notify_favorites_price_drop();

-- ── Buyer preferences (Telegram bot filtering) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.buyer_preferences (
  user_id uuid PRIMARY KEY,
  category_ids uuid[] NOT NULL DEFAULT '{}',
  price_min numeric,
  price_max numeric,
  preferred_cities text[] NOT NULL DEFAULT '{}',
  telegram_alerts_enabled boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE ON public.buyer_preferences TO authenticated;
GRANT ALL ON public.buyer_preferences TO service_role;
ALTER TABLE public.buyer_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own buyer preferences" ON public.buyer_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Demo backfill: coordinates by Addis sub-city, delivery + discount ───
UPDATE public.listings SET
  latitude = CASE sub_city
    WHEN 'Bole' THEN 9.0149 WHEN 'Piassa' THEN 9.0305 WHEN 'Kazanchis' THEN 9.0085
    WHEN 'Gerji' THEN 9.0196 WHEN 'Sarbet' THEN 9.0008 WHEN 'Megenagna' THEN 9.0246
    ELSE 9.03 END,
  longitude = CASE sub_city
    WHEN 'Bole' THEN 38.7869 WHEN 'Piassa' THEN 38.7456 WHEN 'Kazanchis' THEN 38.7641
    WHEN 'Gerji' THEN 38.8438 WHEN 'Sarbet' THEN 38.7542 WHEN 'Megenagna' THEN 38.8004
    ELSE 38.74 END
WHERE latitude IS NULL AND city = 'Addis Ababa';

UPDATE public.listings SET
  delivery_offered = true,
  delivery_fee = 800,
  discount_expires_at = now() + interval '30 days'
WHERE id IN ('33333333-3333-3333-3333-333333333301', '33333333-3333-3333-3333-333333333303');
