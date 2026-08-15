-- ── View milestones (one-time seller alerts) ──────────────────────────────
-- Sellers get a Telegram DM when a listing crosses 10 / 50 / 100 / 500 views,
-- once per threshold, never again. The threshold values live in the edge
-- function (telegram-notify); this table just records what already fired so
-- the check is idempotent.
CREATE TABLE IF NOT EXISTS public.listing_view_milestones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  threshold integer NOT NULL,
  reached_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, threshold)
);

CREATE INDEX IF NOT EXISTS listing_view_milestones_listing_idx
  ON public.listing_view_milestones (listing_id);
