-- PHONE OTP VERIFICATION + FEATURED LISTINGS
-- Phone verification: profiles.phone_verified_at + server-only phone_otps table.
-- Featured listings: monetization-ready homepage curation flag.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

-- Server-only store for one-time codes. No anon/authenticated grants and no
-- RLS policies, so only the service role (via server functions) can touch it.
CREATE TABLE IF NOT EXISTS public.phone_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  code text NOT NULL,
  purpose text NOT NULL DEFAULT 'verify_phone',
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_otps_user_idx ON public.phone_otps (user_id, created_at DESC);
REVOKE ALL ON public.phone_otps FROM anon, authenticated;
GRANT ALL ON public.phone_otps TO service_role;
ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;

-- Featured listings (admin curation, homepage "Featured" section)
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS listings_featured_idx ON public.listings (featured) WHERE status = 'active';

-- Seed: feature two demo listings so the homepage section has content.
UPDATE public.listings SET featured = true
WHERE id IN (
  '33333333-3333-3333-3333-333333333301',
  '33333333-3333-3333-3333-333333333303'
);
