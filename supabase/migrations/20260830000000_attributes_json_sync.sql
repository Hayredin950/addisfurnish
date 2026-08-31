-- ── Phase 4c: JSONB projection of listing attribute values (spec §11) ───────
--
-- `attributes_json` on `listings` is the performance companion to the
-- relational `listing_attribute_values` table. Clients never write it: a
-- database trigger rebuilds it whenever a listing's attribute values change,
-- so the document is always in sync no matter which client inserts values
-- (website, Flutter, or the Telegram bot).
--
-- Document shape (keyed by attribute slug):
--   text          -> { "model": "Sierra 2500" }
--   number/range  -> { "capacity": 180 }
--   boolean       -> { "smart-tv": true }
--   single_select -> { "material": "wood" }            (option.value)
--   multi_select  -> { "color": ["black", "grey"] }    (array of option.values)
-- A single_select with a free-text fallback (no option picked) stores the
-- typed text as-is.

-- ── 1) Column + index ───────────────────────────────────────────────────────
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS attributes_json jsonb;

-- GIN index so buyer filters can hit the document directly (spec §14).
CREATE INDEX IF NOT EXISTS listings_attributes_json_gin
  ON public.listings USING gin (attributes_json);

-- ── 2) Rebuild the document for one listing ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_listing_attributes_json(_listing_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = public
AS $$
DECLARE
  _doc jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(d.slug, d.val), '{}'::jsonb)
  INTO _doc
  FROM (
    SELECT a.slug,
           CASE a.type
             WHEN 'number'        THEN to_jsonb(v.value_number)
             WHEN 'boolean'       THEN to_jsonb(v.value_boolean)
             WHEN 'single_select' THEN
               CASE
                 WHEN v.option_id IS NOT NULL
                   THEN to_jsonb(o.value)
                 ELSE to_jsonb(v.value_text)
               END
             WHEN 'multi_select'  THEN
               -- Each chosen option is its own row; collect them per slug.
               array_to_json(ARRAY(SELECT o2.value
                                   FROM public.listing_attribute_values v2
                                   JOIN public.attribute_options o2
                                     ON o2.id = v2.option_id
                                   WHERE v2.listing_id = v.listing_id
                                     AND v2.attribute_id = v.attribute_id
                                     AND v2.option_id IS NOT NULL
                                   ORDER BY o2.sort_order))::jsonb
             ELSE to_jsonb(v.value_text)
           END AS val
    FROM public.listing_attribute_values v
    JOIN public.attributes a ON a.id = v.attribute_id
    LEFT JOIN public.attribute_options o ON o.id = v.option_id
    WHERE v.listing_id = _listing_id
      AND a.is_active
  ) d
  WHERE d.val IS NOT NULL;

  UPDATE public.listings l
  SET attributes_json = _doc
  WHERE l.id = _listing_id;
END; $$;

-- ── 3) Keep it in sync ─────────────────────────────────────────────────────
-- Fire on any change to a listing's attribute values. Deletes must refresh too
-- (a required value removed may collapse the document), so AFTER DELETE as well.
CREATE OR REPLACE FUNCTION public.sync_listing_attributes_json()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_listing_attributes_json(OLD.listing_id);
  ELSE
    PERFORM public.refresh_listing_attributes_json(NEW.listing_id);
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS listings_attributes_json_sync ON public.listing_attribute_values;
CREATE TRIGGER listings_attributes_json_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.listing_attribute_values
  FOR EACH ROW EXECUTE FUNCTION public.sync_listing_attributes_json();

-- ── 4) Backfill existing listings ───────────────────────────────────────────
DO $$
DECLARE
  _id uuid;
BEGIN
  FOR _id IN SELECT id FROM public.listings LOOP
    PERFORM public.refresh_listing_attributes_json(_id);
  END LOOP;
END $$;