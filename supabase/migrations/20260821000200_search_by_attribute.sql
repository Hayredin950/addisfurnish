-- ── Phase 6: dynamic buyer filters from category attributes (spec §6) ─────
--
-- The legacy browse filters read fixed listing columns (condition / material /
-- room). With the Phase 4 attribute system live, buyers can filter on ANY
-- attribute a seller's category configures. This RPC performs that lookup
-- server-side so clients never need to know an attribute's type:
--
--   SELECT * FROM public.attribute_matching_listing_ids(
--     p_attrs => '{"material":["wood","leather"],"color":["brown","black"]}'::jsonb
--   );
--
-- Semantics:
--   * p_attrs maps an attribute SLUG -> JSON array of values.
--   * For single_select / multi_select, values are option values ("wood") and
--     match on option_id.
--   * For number / range, each value is [min,max]; null bound is open-ended.
--   * Attributes AND; values within one attribute OR. A listing must match
--     EVERY supplied attribute.
--   * Unknown / inactive attribute slugs are ignored.
--
-- Safe for public calls — reads only and returns ids.

CREATE OR REPLACE FUNCTION public.attribute_matching_listing_ids(
  p_attrs jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (listing_id uuid)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  _attr_id   uuid;
  _attr_type text;
  _acc       uuid[];
BEGIN
  FOR _attr_id, _attr_type IN
    SELECT a.id, a.type
    FROM public.attributes a
    WHERE a.slug = ANY (ARRAY(SELECT jsonb_object_keys(p_attrs)))
      AND a.is_active
  LOOP
    IF _attr_type IN ('single_select','multi_select') THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT v.listing_id), ARRAY[]::uuid[])
        INTO _acc
      FROM public.listing_attribute_values v
      JOIN public.attribute_options o
        ON o.id = v.option_id AND o.attribute_id = v.attribute_id
      WHERE v.attribute_id = _attr_id
        AND o.value = ANY (ARRAY(
              SELECT jsonb_array_elements_text(p_attrs -> a.slug)
              FROM public.attributes a WHERE a.id = _attr_id
            ));
    ELSIF _attr_type IN ('number','range') THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT v.listing_id), ARRAY[]::uuid[])
        INTO _acc
      FROM public.listing_attribute_values v
      WHERE v.attribute_id = _attr_id
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_attrs -> a.slug) e
          WHERE (e->>0)::numeric IS NULL OR v.value_number >= (e->>0)::numeric
            AND (e->>1)::numeric IS NULL OR v.value_number <= (e->>1)::numeric
          FROM public.attributes a WHERE a.id = _attr_id
        );
    END IF;

    -- AND: narrow to ids that matched this attribute.
    IF _acc IS NULL THEN _acc := ARRAY[]::uuid[]; END IF;
    RETURN QUERY SELECT u FROM unnest(_acc) u;
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION public.attribute_matching_listing_ids(jsonb)
  TO anon, authenticated;
EOF
echo 'written'; wc -l /home/hayredin/Documents/pro/suqbet/supabase/migrations/20260821000200_search_by_attribute.sql"]
