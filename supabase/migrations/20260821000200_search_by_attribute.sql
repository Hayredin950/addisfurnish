-- ── Phase 6: dynamic buyer filters from category attributes (spec §14) ────
--
-- The legacy browse filters read fixed listing columns (condition / material /
-- room). With the Phase 4 attribute system live, buyers can filter on ANY
-- attribute a seller's category configures. This RPC performs that lookup
-- server-side so clients never need to know an attribute's type:
--
--   SELECT listing_id FROM public.attribute_matching_listing_ids(
--     p_attrs => '{"material":["wood","leather"],"capacity":[[50,200]]}'::jsonb,
--     p_listing_ids => NULL  -- optional candidate set to narrow
--   );
--
-- Semantics (spec §14):
--   * p_attrs maps an attribute SLUG -> JSON array of values.
--       - single_select / multi_select: values are option values ("wood")
--         and match through option_id.
--       - number / range: each entry is [min,max]; a null bound is open-ended.
--       - text: case-insensitive substring match.
--       - boolean: entries are true/false.
--   * Attributes AND together; values within one attribute OR.
--     A listing must match EVERY supplied attribute.
--   * Unknown / inactive attribute slugs are ignored.
--   * p_listing_ids optionally narrows the result (used by clients that
--     already have a candidate id set from search/category queries).
--
-- Safe for public calls — reads only and returns ids.

CREATE OR REPLACE FUNCTION public.attribute_matching_listing_ids(
  p_attrs jsonb DEFAULT '{}'::jsonb,
  p_listing_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (listing_id uuid)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  _slug      text;
  _attr_id   uuid;
  _attr_type text;
  _matched   uuid[];
BEGIN
  FOR _slug IN SELECT jsonb_object_keys(p_attrs) LOOP
    SELECT a.id, a.type INTO _attr_id, _attr_type
    FROM public.attributes a
    WHERE a.slug = _slug AND a.is_active;
    -- Unknown or inactive slugs are ignored entirely.
    IF _attr_id IS NULL THEN
      CONTINUE;
    END IF;

    IF _attr_type IN ('single_select', 'multi_select') THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT v.listing_id), ARRAY[]::uuid[])
        INTO _matched
      FROM public.listing_attribute_values v
      JOIN public.attribute_options o
        ON o.id = v.option_id AND o.attribute_id = v.attribute_id
      WHERE v.attribute_id = _attr_id
        AND o.value IN (
          SELECT jsonb_array_elements_text(p_attrs -> _slug)
        );

    ELSIF _attr_type IN ('number', 'range') THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT v.listing_id), ARRAY[]::uuid[])
        INTO _matched
      FROM public.listing_attribute_values v
      WHERE v.attribute_id = _attr_id
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_attrs -> _slug) e
          WHERE ((e->>0)::numeric IS NULL OR v.value_number >= (e->>0)::numeric)
            AND ((e->>1)::numeric IS NULL OR v.value_number <= (e->>1)::numeric)
        );

    ELSIF _attr_type = 'text' THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT v.listing_id), ARRAY[]::uuid[])
        INTO _matched
      FROM public.listing_attribute_values v
      WHERE v.attribute_id = _attr_id
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(p_attrs -> _slug) q
          WHERE v.value_text ILIKE '%' || q || '%'
        );

    ELSIF _attr_type = 'boolean' THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT v.listing_id), ARRAY[]::uuid[])
        INTO _matched
      FROM public.listing_attribute_values v
      WHERE v.attribute_id = _attr_id
        AND v.value_boolean::text IN (
          SELECT jsonb_array_elements_text(p_attrs -> _slug)
        );
    END IF;

    _matched := COALESCE(_matched, ARRAY[]::uuid[]);

    -- AND across attributes: narrow the candidate set with each attribute.
    IF p_listing_ids IS NOT NULL THEN
      p_listing_ids := ARRAY(
        SELECT unnest(p_listing_ids)
        INTERSECT
        SELECT unnest(_matched)
      );
    ELSE
      p_listing_ids := _matched;
    END IF;
  END LOOP;

  RETURN QUERY SELECT u FROM unnest(COALESCE(p_listing_ids, ARRAY[]::uuid[])) AS u;
END; $$;

GRANT EXECUTE ON FUNCTION public.attribute_matching_listing_ids(jsonb, uuid[])
  TO anon, authenticated;
