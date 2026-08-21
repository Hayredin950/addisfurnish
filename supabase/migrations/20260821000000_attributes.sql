-- ── Phase 4: dynamic per-category attribute system ─────────────────────────
-- Categories say WHAT a product is; attributes say what is DIFFERENT about it
-- (spec §7). Everything here is data-driven: an admin adds an attribute or an
-- option and every client picks it up without a rebuild.

-- ── 1) attributes (spec §8) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attributes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  name_am       text,
  slug          text NOT NULL UNIQUE,
  type          text NOT NULL
                  CHECK (type IN ('text','number','boolean','single_select','multi_select','range')),
  unit          text,
  is_filterable boolean NOT NULL DEFAULT true,
  -- Default requiredness. The per-category row in category_attributes wins.
  is_required   boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 2) attribute_options (spec §10) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attribute_options (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id uuid NOT NULL REFERENCES public.attributes(id) ON DELETE CASCADE,
  value        text NOT NULL,
  label        text NOT NULL,
  label_am     text,
  sort_order   int NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  UNIQUE (attribute_id, value)
);
CREATE INDEX IF NOT EXISTS attribute_options_attr_idx
  ON public.attribute_options (attribute_id, sort_order);

-- ── 3) category_attributes (spec §9) ───────────────────────────────────────
-- One attribute reused across many categories. Attached at any level: a row on
-- a level-0 category applies to its whole subtree (see category_attribute_set).
CREATE TABLE IF NOT EXISTS public.category_attributes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  attribute_id  uuid NOT NULL REFERENCES public.attributes(id) ON DELETE CASCADE,
  is_required   boolean NOT NULL DEFAULT false,
  is_filterable boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE (category_id, attribute_id)
);
CREATE INDEX IF NOT EXISTS category_attributes_category_idx
  ON public.category_attributes (category_id, sort_order);

-- ── 4) listing_attribute_values (spec §11) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_attribute_values (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  attribute_id  uuid NOT NULL REFERENCES public.attributes(id) ON DELETE CASCADE,
  value_text    text,
  value_number  numeric,
  value_boolean boolean,
  option_id     uuid REFERENCES public.attribute_options(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Spec §11 indexing requirement — planned in now, not as a later pass.
CREATE INDEX IF NOT EXISTS listing_attribute_values_listing_attr_idx
  ON public.listing_attribute_values (listing_id, attribute_id);
CREATE INDEX IF NOT EXISTS listing_attribute_values_option_idx
  ON public.listing_attribute_values (option_id) WHERE option_id IS NOT NULL;
-- Buyer filters read attribute-first ("every listing whose Material = Leather"),
-- which the composite above cannot serve because listing_id leads it.
CREATE INDEX IF NOT EXISTS listing_attribute_values_attr_option_idx
  ON public.listing_attribute_values (attribute_id, option_id);
CREATE INDEX IF NOT EXISTS listing_attribute_values_attr_number_idx
  ON public.listing_attribute_values (attribute_id, value_number)
  WHERE value_number IS NOT NULL;

-- multi_select stores one row per chosen option; everything else is single-valued.
CREATE UNIQUE INDEX IF NOT EXISTS listing_attribute_values_single_uniq
  ON public.listing_attribute_values (listing_id, attribute_id)
  WHERE option_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS listing_attribute_values_option_uniq
  ON public.listing_attribute_values (listing_id, attribute_id, option_id)
  WHERE option_id IS NOT NULL;

-- ── 5) Resolve the attribute set for a category (self + ancestors) ─────────
-- Lets an admin attach "Condition" once at a root and have it apply
-- everywhere, while a deeper category can override requiredness.
-- The most specific row (deepest category) wins.
CREATE OR REPLACE FUNCTION public.category_attribute_set(_category_id uuid)
RETURNS TABLE (
  attribute_id  uuid,
  slug          text,
  name          text,
  name_am       text,
  type          text,
  unit          text,
  is_required   boolean,
  is_filterable boolean,
  sort_order    int,
  from_level    int
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, level FROM public.categories WHERE id = _category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.level
    FROM public.categories c JOIN chain ch ON c.id = ch.parent_id
  )
  SELECT DISTINCT ON (a.id)
    a.id, a.slug, a.name, a.name_am, a.type, a.unit,
    ca.is_required, ca.is_filterable, ca.sort_order, ch.level
  FROM chain ch
  JOIN public.category_attributes ca ON ca.category_id = ch.id
  JOIN public.attributes a ON a.id = ca.attribute_id
  WHERE a.is_active
  -- DISTINCT ON keeps the first row per attribute: deepest category wins.
  ORDER BY a.id, ch.level DESC;
$$;

GRANT EXECUTE ON FUNCTION public.category_attribute_set(uuid) TO anon, authenticated;

-- ── 6) Value integrity ─────────────────────────────────────────────────────
-- Guarantees hold no matter which client writes: website, Flutter, or the
-- Telegram bot (spec §12 — the bot must never bypass validation).
CREATE OR REPLACE FUNCTION public.validate_listing_attribute_value()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _type     text;
  _filled   int;
  _opt_attr uuid;
BEGIN
  SELECT type INTO _type FROM public.attributes WHERE id = NEW.attribute_id AND is_active;
  IF _type IS NULL THEN
    RAISE EXCEPTION 'attribute does not exist or is inactive';
  END IF;

  -- Exactly one value column may be populated.
  _filled := (NEW.value_text IS NOT NULL)::int
           + (NEW.value_number IS NOT NULL)::int
           + (NEW.value_boolean IS NOT NULL)::int
           + (NEW.option_id IS NOT NULL)::int;
  IF _filled <> 1 THEN
    RAISE EXCEPTION 'exactly one of value_text/value_number/value_boolean/option_id must be set (got %)', _filled;
  END IF;

  -- The populated column must match the attribute's declared type.
  IF _type IN ('single_select','multi_select') THEN
    IF NEW.option_id IS NULL THEN
      RAISE EXCEPTION 'attribute of type % requires option_id', _type;
    END IF;
    SELECT attribute_id INTO _opt_attr
    FROM public.attribute_options WHERE id = NEW.option_id AND is_active;
    IF _opt_attr IS NULL THEN
      RAISE EXCEPTION 'attribute option does not exist or is inactive';
    END IF;
    IF _opt_attr <> NEW.attribute_id THEN
      RAISE EXCEPTION 'attribute option belongs to a different attribute';
    END IF;
  ELSIF _type IN ('number','range') THEN
    IF NEW.value_number IS NULL THEN
      RAISE EXCEPTION 'attribute of type % requires value_number', _type;
    END IF;
  ELSIF _type = 'boolean' THEN
    IF NEW.value_boolean IS NULL THEN
      RAISE EXCEPTION 'attribute of type boolean requires value_boolean';
    END IF;
  ELSIF _type = 'text' THEN
    IF NEW.value_text IS NULL OR btrim(NEW.value_text) = '' THEN
      RAISE EXCEPTION 'attribute of type text requires a non-empty value_text';
    END IF;
  END IF;

  -- The attribute must actually be configured for this listing's category.
  IF NOT EXISTS (
    SELECT 1
    FROM public.listings l
    JOIN public.category_attribute_set(l.category_id) s ON s.attribute_id = NEW.attribute_id
    WHERE l.id = NEW.listing_id
  ) THEN
    RAISE EXCEPTION 'attribute is not configured for this listing''s category';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS listing_attribute_values_validate ON public.listing_attribute_values;
CREATE TRIGGER listing_attribute_values_validate
  BEFORE INSERT OR UPDATE ON public.listing_attribute_values
  FOR EACH ROW EXECUTE FUNCTION public.validate_listing_attribute_value();

-- ── 7) Required attributes must be present before publishing (spec §12) ────
-- Returns the attributes a listing still needs. Clients call this to render a
-- friendly "still missing: Brand, Capacity" message instead of a raw error.
CREATE OR REPLACE FUNCTION public.missing_required_attributes(_listing_id uuid)
RETURNS TABLE (attribute_id uuid, slug text, name text, name_am text)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT s.attribute_id, s.slug, s.name, s.name_am
  FROM public.listings l
  JOIN public.category_attribute_set(l.category_id) s ON s.is_required
  WHERE l.id = _listing_id
    AND NOT EXISTS (
      SELECT 1 FROM public.listing_attribute_values v
      WHERE v.listing_id = l.id AND v.attribute_id = s.attribute_id
    )
  ORDER BY s.sort_order, s.name;
$$;

GRANT EXECUTE ON FUNCTION public.missing_required_attributes(uuid) TO anon, authenticated;

-- Enforced as a DEFERRABLE constraint trigger so it runs at COMMIT. A client
-- can insert the listing and its attribute values in either order inside one
-- transaction and still pass.
CREATE OR REPLACE FUNCTION public.enforce_required_attributes()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _missing text;
BEGIN
  -- Only publishing is gated. Drafts are free to be incomplete — that is the
  -- entire point of a draft.
  IF NEW.status <> 'active' OR NEW.category_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT string_agg(name, ', ' ORDER BY name)
  INTO _missing
  FROM public.missing_required_attributes(NEW.id);

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'missing required attributes: %', _missing
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS listings_required_attributes ON public.listings;
CREATE CONSTRAINT TRIGGER listings_required_attributes
  AFTER INSERT OR UPDATE OF status, category_id ON public.listings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_required_attributes();

-- ── 8) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.attributes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribute_options        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_attributes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_attribute_values ENABLE ROW LEVEL SECURITY;

-- Config tables: world-readable (every listing form and filter bar needs them),
-- admin-writable only.
DROP POLICY IF EXISTS "attributes readable" ON public.attributes;
CREATE POLICY "attributes readable" ON public.attributes
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "attributes admin write" ON public.attributes;
CREATE POLICY "attributes admin write" ON public.attributes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "attribute_options readable" ON public.attribute_options;
CREATE POLICY "attribute_options readable" ON public.attribute_options
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "attribute_options admin write" ON public.attribute_options;
CREATE POLICY "attribute_options admin write" ON public.attribute_options
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "category_attributes readable" ON public.category_attributes;
CREATE POLICY "category_attributes readable" ON public.category_attributes
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "category_attributes admin write" ON public.category_attributes;
CREATE POLICY "category_attributes admin write" ON public.category_attributes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Values: readable with the listing, writable only by the listing's seller.
DROP POLICY IF EXISTS "listing values readable" ON public.listing_attribute_values;
CREATE POLICY "listing values readable" ON public.listing_attribute_values
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "seller writes own listing values" ON public.listing_attribute_values;
CREATE POLICY "seller writes own listing values" ON public.listing_attribute_values
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = listing_attribute_values.listing_id
      AND (l.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = listing_attribute_values.listing_id
      AND (l.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

GRANT SELECT ON public.attributes, public.attribute_options, public.category_attributes,
                public.listing_attribute_values TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.attributes, public.attribute_options,
                public.category_attributes, public.listing_attribute_values TO authenticated;

-- ── 9) updated_at touch ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_attributes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS attributes_touch ON public.attributes;
CREATE TRIGGER attributes_touch BEFORE UPDATE ON public.attributes
  FOR EACH ROW EXECUTE FUNCTION public.touch_attributes_updated_at();
