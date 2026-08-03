-- Fixes: missing storage bucket, self-conversations, map coordinates,
-- and per-category listing counts.
--
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1. The listing-images bucket was never created.
--
-- 20260802081623 wrote four RLS policies referencing bucket_id =
-- 'listing-images' but never inserted the bucket row, so every upload failed
-- with "Bucket not found". Public so images are served straight from the CDN.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-images',
  'listing-images',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The existing INSERT policy requires the first path segment to equal the
-- caller's uid. Shop logos now upload to '<uid>/logos/…' to satisfy it, so the
-- policies themselves need no change.

-- ---------------------------------------------------------------------------
-- 2. A seller could open a conversation with themselves on their own listing.
--
-- The INSERT policy only checked buyer_id = auth.uid(), which self-chat
-- satisfies. Delete any existing self-conversations, then forbid them.
-- ---------------------------------------------------------------------------
DELETE FROM public.conversations WHERE buyer_id = seller_id;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_no_self_chat;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_no_self_chat CHECK (buyer_id <> seller_id);

-- Also block it at the policy layer so the error surfaces as a permission
-- denial rather than a constraint violation.
DROP POLICY IF EXISTS "buyer starts conversation" ON public.conversations;
CREATE POLICY "buyer starts conversation" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid() AND buyer_id <> seller_id);

-- ---------------------------------------------------------------------------
-- 3. Map coordinates for the Leaflet/OpenStreetMap location picker.
--
-- listings.latitude/longitude already exist (20260802084000); only profiles
-- needs them, so the shop location can be pinned once and reused per listing.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

COMMENT ON COLUMN public.profiles.latitude IS 'Shop latitude (WGS84), set by the map picker.';
COMMENT ON COLUMN public.profiles.longitude IS 'Shop longitude (WGS84), set by the map picker.';

-- Speeds up "near me" bounding-box browsing.
CREATE INDEX IF NOT EXISTS listings_lat_lng_idx
  ON public.listings (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Foreign keys from chat participants to profiles.
--
-- buyer_id/seller_id/sender_id were plain uuid columns with no FK, so PostgREST
-- could not embed the participant's name and avatar — the chat UI could only
-- show bare message text. Rows referencing deleted users are cleaned up first
-- so the constraints can be validated.
-- ---------------------------------------------------------------------------
DELETE FROM public.conversations AS c
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.buyer_id)
   OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.seller_id);

DELETE FROM public.messages AS m
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.sender_id);

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_buyer_id_fkey;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_buyer_id_fkey FOREIGN KEY (buyer_id)
  REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_seller_id_fkey;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_seller_id_fkey FOREIGN KEY (seller_id)
  REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id)
  REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Per-category listing counts for the categories page.
--
-- A category's count includes its direct children, matching how browse.tsx
-- filters (a root category shows its subcategories' listings too).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.category_listing_counts
WITH (security_invoker = true) AS
SELECT
  c.id   AS category_id,
  c.slug AS category_slug,
  COUNT(l.id) AS listing_count
FROM public.categories c
LEFT JOIN public.listings l
  ON (l.category_id = c.id OR l.category_id IN (
        SELECT child.id FROM public.categories child WHERE child.parent_id = c.id
     ))
  AND l.status = 'active'
GROUP BY c.id, c.slug;

GRANT SELECT ON public.category_listing_counts TO anon, authenticated;
