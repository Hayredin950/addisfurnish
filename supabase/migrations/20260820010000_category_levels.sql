-- ── Phase 2: dynamic 3-level category hierarchy ────────────────────────────
-- Adds level/is_active/description/image_url/updated_at to categories,
-- enforces the 3-level rules server-side, and seeds the initial taxonomy.

-- 1) New columns
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2) Backfill levels for pre-existing rows (old structure: root + one child level)
UPDATE public.categories SET level = 0 WHERE parent_id IS NULL;
UPDATE public.categories SET level = 1 WHERE parent_id IS NOT NULL;

-- 3) Hierarchy validation (max 3 levels; spec §6)
--
-- `level` is a denormalised cache of depth, so it is always DERIVED from
-- parent_id and never trusted from the caller. That keeps admin "move
-- category" calls honest: the client only has to send the new parent_id, and
-- it is impossible to write a row whose level disagrees with its parent.
CREATE OR REPLACE FUNCTION public.validate_category_hierarchy()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _parent_level int;
  _ancestor uuid;
  _hops int := 0;
  _max_descendant_depth int;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.level := 0;
  ELSE
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'a category cannot be its own parent';
    END IF;

    SELECT level INTO _parent_level FROM public.categories WHERE id = NEW.parent_id;
    IF _parent_level IS NULL THEN
      RAISE EXCEPTION 'parent category does not exist';
    END IF;

    -- Cycle guard: walk up from the new parent. If we reach this row, the move
    -- would create a loop, which would make the recursive tree queries below
    -- (and category_listing_counts) spin forever.
    _ancestor := NEW.parent_id;
    WHILE _ancestor IS NOT NULL LOOP
      IF _ancestor = NEW.id THEN
        RAISE EXCEPTION 'cannot move a category beneath one of its own descendants';
      END IF;
      _hops := _hops + 1;
      IF _hops > 64 THEN
        RAISE EXCEPTION 'category hierarchy already contains a cycle';
      END IF;
      SELECT parent_id INTO _ancestor FROM public.categories WHERE id = _ancestor;
    END LOOP;

    NEW.level := _parent_level + 1;
  END IF;

  IF NEW.level > 2 THEN
    RAISE EXCEPTION 'category depth cannot exceed 3 levels';
  END IF;

  -- A move must also leave room for everything already hanging underneath.
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    WITH RECURSIVE d AS (
      SELECT id, 0 AS rel_depth FROM public.categories WHERE id = NEW.id
      UNION ALL
      SELECT c.id, d.rel_depth + 1
      FROM public.categories c JOIN d ON c.parent_id = d.id
    )
    SELECT max(rel_depth) INTO _max_descendant_depth FROM d;

    IF NEW.level + coalesce(_max_descendant_depth, 0) > 2 THEN
      RAISE EXCEPTION
        'moving this category to level % would push its deepest child to level %, past the 3-level limit',
        NEW.level, NEW.level + _max_descendant_depth;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS categories_hierarchy ON public.categories;
CREATE TRIGGER categories_hierarchy
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.validate_category_hierarchy();

-- 3b) Re-derive descendants' levels after a subtree is moved. Without this a
--     move leaves children holding their old level. Touching each child
--     re-fires the BEFORE trigger, which recomputes its level from the new
--     parent and cascades one step further down. Bounded by the depth limit.
CREATE OR REPLACE FUNCTION public.cascade_category_levels()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.categories
  SET parent_id = parent_id          -- no-op write; the BEFORE trigger re-derives level
  WHERE parent_id = NEW.id
    AND level <> NEW.level + 1;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS categories_cascade_levels ON public.categories;
CREATE TRIGGER categories_cascade_levels
  AFTER UPDATE OF parent_id, level ON public.categories
  FOR EACH ROW
  WHEN (NEW.level IS DISTINCT FROM OLD.level)
  EXECUTE FUNCTION public.cascade_category_levels();

-- 4) Listings may only reference existing, active categories.
--    Deactivating a category never touches existing listings.
CREATE OR REPLACE FUNCTION public.validate_listing_category()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _active boolean;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT is_active INTO _active FROM public.categories WHERE id = NEW.category_id;
    IF _active IS NULL THEN
      RAISE EXCEPTION 'category does not exist';
    END IF;
    IF NOT _active THEN
      RAISE EXCEPTION 'category "%" is deactivated and cannot be used for new listings',
        (SELECT name FROM public.categories WHERE id = NEW.category_id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS listings_category ON public.listings;
CREATE TRIGGER listings_category
  BEFORE INSERT OR UPDATE OF category_id ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.validate_listing_category();

-- 5) Tree read index (nav menus, filters, admin tree)
CREATE INDEX IF NOT EXISTS categories_parent_sort_idx
  ON public.categories (parent_id, sort_order, level);

-- 6) Count listings across the whole descendant subtree
CREATE OR REPLACE VIEW public.category_listing_counts
WITH (security_invoker = true) AS
WITH RECURSIVE subtree AS (
  SELECT id, id AS ancestor_id
  FROM public.categories
  UNION ALL
  SELECT c.id, s.ancestor_id
  FROM public.categories c
  JOIN subtree s ON c.parent_id = s.id
)
SELECT
  s.ancestor_id AS category_id,
  c.slug        AS category_slug,
  COUNT(l.id)   AS listing_count
FROM subtree s
JOIN public.categories c ON c.id = s.ancestor_id
LEFT JOIN public.listings l
  ON l.category_id = s.id
  AND l.status = 'active'
GROUP BY s.ancestor_id, c.slug;

GRANT SELECT ON public.category_listing_counts TO anon, authenticated;

-- 7) Seed the initial 3-level taxonomy ─────────────────────────────────────
--    Pre-existing rows are reparented/renamed in place (slugs and ids are
--    stable identifiers — they never change, only display names do).

-- Furniture root + reparent old flat roots underneath it
INSERT INTO public.categories (id, name, slug, parent_id, level, icon, sort_order)
VALUES ('11111111-1111-1111-1111-111111111107','Furniture','furniture',NULL,0,'sofa',1)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, level = 0;

UPDATE public.categories SET parent_id = '11111111-1111-1111-1111-111111111107', level = 1
WHERE slug IN ('living-room','bedroom','office','outdoor','storage');

-- Dining (new L1 under Furniture)
INSERT INTO public.categories (id, name, slug, parent_id, level, icon, sort_order)
VALUES ('12121212-1212-1212-1212-121212121201','Dining','dining','11111111-1111-1111-1111-111111111107',1,'utensils',4)
ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, level = 1;

-- Existing children move to their new parents; display names align with the new taxonomy
UPDATE public.categories SET parent_id = '12121212-1212-1212-1212-121212121201', level = 2
WHERE slug = 'dining-sets';
UPDATE public.categories SET name = 'Outdoor Chairs' WHERE slug = 'garden-chairs';
UPDATE public.categories SET name = 'Shelving Units' WHERE slug = 'shelves';

-- Remaining new roots
INSERT INTO public.categories (id, name, slug, parent_id, level, icon, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111108','Appliances','appliances',NULL,0,'refrigerator',2),
  ('11111111-1111-1111-1111-111111111109','Electronics & Entertainment','electronics-entertainment',NULL,0,'tv',3),
  ('11111111-1111-1111-1111-111111111110','Home Décor','home-decor',NULL,0,'palette',5),
  ('11111111-1111-1111-1111-111111111111','Lighting','lighting',NULL,0,'lamp',6),
  ('11111111-1111-1111-1111-111111111112','Bathroom','bathroom',NULL,0,'shower',7),
  ('11111111-1111-1111-1111-111111111113','Curtains, Rugs & Mats','curtains-rugs-mats',NULL,0,'curtains',8),
  ('11111111-1111-1111-1111-111111111114','Baby & Kids','baby-kids',NULL,0,'baby',9),
  ('11111111-1111-1111-1111-111111111115','Tools & DIY','tools-diy',NULL,0,'tools',10),
  ('11111111-1111-1111-1111-111111111116','Home Improvement','home-improvement',NULL,0,'hammer',11)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, level = 0, sort_order = EXCLUDED.sort_order;

-- Kitchen & Dining keeps its existing root row; refresh display/sort
UPDATE public.categories
SET name = 'Kitchen & Dining', sort_order = 4, level = 0
WHERE slug = 'kitchen-dining';

-- Level 1 + level 2 rows
INSERT INTO public.categories (id, name, slug, parent_id, level, sort_order) VALUES
  -- Furniture → Living Room
  ('13131313-1313-1313-1313-131313131301','Majlis / Floor Seating','majlis-floor-seating','11111111-1111-1111-1111-111111111101',2,4),
  ('13131313-1313-1313-1313-131313131302','Armchairs','armchairs','11111111-1111-1111-1111-111111111101',2,5),
  ('13131313-1313-1313-1313-131313131303','Side Tables','side-tables','11111111-1111-1111-1111-111111111101',2,6),
  -- Furniture → Bedroom
  ('13131313-1313-1313-1313-131313131304','Bedside Tables','bedside-tables','11111111-1111-1111-1111-111111111102',2,3),
  ('13131313-1313-1313-1313-131313131305','Dressers','dressers','11111111-1111-1111-1111-111111111102',2,4),
  ('13131313-1313-1313-1313-131313131306','Mattresses','mattresses','11111111-1111-1111-1111-111111111102',2,5),
  -- Furniture → Dining
  ('13131313-1313-1313-1313-131313131307','Dining Tables','dining-tables','12121212-1212-1212-1212-121212121201',2,1),
  ('13131313-1313-1313-1313-131313131308','Dining Chairs','dining-chairs','12121212-1212-1212-1212-121212121201',2,2),
  -- Furniture → Office
  ('13131313-1313-1313-1313-131313131309','Filing Cabinets','filing-cabinets','11111111-1111-1111-1111-111111111103',2,3),
  ('13131313-1313-1313-1313-131313131310','Bookcases','bookcases','11111111-1111-1111-1111-111111111103',2,4),
  -- Furniture → Outdoor
  ('13131313-1313-1313-1313-131313131311','Patio Sets','patio-sets','11111111-1111-1111-1111-111111111105',2,1),
  ('13131313-1313-1313-1313-131313131312','Outdoor Tables','outdoor-tables','11111111-1111-1111-1111-111111111105',2,3),
  -- Furniture → Storage
  ('13131313-1313-1313-1313-131313131313','Storage Cabinets','storage-cabinets','11111111-1111-1111-1111-111111111106',2,2),
  ('13131313-1313-1313-1313-131313131314','Storage Boxes','storage-boxes','11111111-1111-1111-1111-111111111106',2,3),
  ('13131313-1313-1313-1313-131313131315','Organizers','organizers','11111111-1111-1111-1111-111111111106',2,4),
  -- Appliances → Kitchen
  ('12121212-1212-1212-1212-121212121202','Kitchen','kitchen','11111111-1111-1111-1111-111111111108',1,1),
  ('13131313-1313-1313-1313-131313131316','Refrigerators','refrigerators','12121212-1212-1212-1212-121212121202',2,1),
  ('13131313-1313-1313-1313-131313131317','Freezers','freezers','12121212-1212-1212-1212-121212121202',2,2),
  ('13131313-1313-1313-1313-131313131318','Ovens','ovens','12121212-1212-1212-1212-121212121202',2,3),
  ('13131313-1313-1313-1313-131313131319','Cookers','cookers','12121212-1212-1212-1212-121212121202',2,4),
  ('13131313-1313-1313-1313-131313131320','Microwaves','microwaves','12121212-1212-1212-1212-121212121202',2,5),
  ('13131313-1313-1313-1313-131313131321','Dishwashers','dishwashers','12121212-1212-1212-1212-121212121202',2,6),
  -- Appliances → Laundry
  ('12121212-1212-1212-1212-121212121203','Laundry','laundry','11111111-1111-1111-1111-111111111108',1,2),
  ('13131313-1313-1313-1313-131313131322','Washing Machines','washing-machines','12121212-1212-1212-1212-121212121203',2,1),
  ('13131313-1313-1313-1313-131313131323','Dryers','dryers','12121212-1212-1212-1212-121212121203',2,2),
  ('13131313-1313-1313-1313-131313131324','Irons','irons','12121212-1212-1212-1212-121212121203',2,3),
  -- Appliances → Cooling & Heating
  ('12121212-1212-1212-1212-121212121204','Cooling & Heating','cooling-heating','11111111-1111-1111-1111-111111111108',1,3),
  ('13131313-1313-1313-1313-131313131325','Air Conditioners','air-conditioners','12121212-1212-1212-1212-121212121204',2,1),
  ('13131313-1313-1313-1313-131313131326','Fans','fans','12121212-1212-1212-1212-121212121204',2,2),
  ('13131313-1313-1313-1313-131313131327','Heaters','heaters','12121212-1212-1212-1212-121212121204',2,3),
  ('13131313-1313-1313-1313-131313131328','Electric Heaters','electric-heaters','12121212-1212-1212-1212-121212121204',2,4),
  -- Appliances → Cleaning
  ('12121212-1212-1212-1212-121212121205','Cleaning','cleaning','11111111-1111-1111-1111-111111111108',1,4),
  ('13131313-1313-1313-1313-131313131329','Vacuum Cleaners','vacuum-cleaners','12121212-1212-1212-1212-121212121205',2,1),
  ('13131313-1313-1313-1313-131313131330','Carpet Cleaners','carpet-cleaners','12121212-1212-1212-1212-121212121205',2,2),
  -- Electronics & Entertainment → TVs & Displays
  ('12121212-1212-1212-1212-121212121206','TVs & Displays','tvs-displays','11111111-1111-1111-1111-111111111109',1,1),
  ('13131313-1313-1313-1313-131313131331','Televisions','televisions','12121212-1212-1212-1212-121212121206',2,1),
  ('13131313-1313-1313-1313-131313131332','Monitors','monitors','12121212-1212-1212-1212-121212121206',2,2),
  ('13131313-1313-1313-1313-131313131333','Projectors','projectors','12121212-1212-1212-1212-121212121206',2,3),
  -- Electronics & Entertainment → Audio
  ('12121212-1212-1212-1212-121212121207','Audio','audio','11111111-1111-1111-1111-111111111109',1,2),
  ('13131313-1313-1313-1313-131313131334','Speakers','speakers','12121212-1212-1212-1212-121212121207',2,1),
  ('13131313-1313-1313-1313-131313131335','Home Theater','home-theater','12121212-1212-1212-1212-121212121207',2,2),
  ('13131313-1313-1313-1313-131313131336','Amplifiers','amplifiers','12121212-1212-1212-1212-121212121207',2,3),
  ('13131313-1313-1313-1313-131313131337','Headphones','headphones','12121212-1212-1212-1212-121212121207',2,4),
  -- Electronics & Entertainment → Gaming
  ('12121212-1212-1212-1212-121212121208','Gaming','gaming','11111111-1111-1111-1111-111111111109',1,3),
  ('13131313-1313-1313-1313-131313131338','Game Consoles','game-consoles','12121212-1212-1212-1212-121212121208',2,1),
  ('13131313-1313-1313-1313-131313131339','Controllers','controllers','12121212-1212-1212-1212-121212121208',2,2),
  ('13131313-1313-1313-1313-131313131340','Gaming Accessories','gaming-accessories','12121212-1212-1212-1212-121212121208',2,3),
  -- Kitchen & Dining → Cookware
  ('12121212-1212-1212-1212-121212121209','Cookware','cookware','11111111-1111-1111-1111-111111111104',1,1),
  ('13131313-1313-1313-1313-131313131341','Pots & Pans','pots-pans','12121212-1212-1212-1212-121212121209',2,1),
  ('13131313-1313-1313-1313-131313131342','Pressure Cookers','pressure-cookers','12121212-1212-1212-1212-121212121209',2,2),
  ('13131313-1313-1313-1313-131313131343','Baking Equipment','baking-equipment','12121212-1212-1212-1212-121212121209',2,3),
  -- Kitchen & Dining → Dishes & Cutlery
  ('12121212-1212-1212-1212-121212121210','Dishes & Cutlery','dishes-cutlery','11111111-1111-1111-1111-111111111104',1,2),
  ('13131313-1313-1313-1313-131313131344','Plates','plates','12121212-1212-1212-1212-121212121210',2,1),
  ('13131313-1313-1313-1313-131313131345','Cups & Glasses','cups-glasses','12121212-1212-1212-1212-121212121210',2,2),
  ('13131313-1313-1313-1313-131313131346','Cutlery Sets','cutlery-sets','12121212-1212-1212-1212-121212121210',2,3),
  -- Kitchen & Dining → Small Kitchen Appliances
  ('12121212-1212-1212-1212-121212121211','Small Kitchen Appliances','small-kitchen-appliances','11111111-1111-1111-1111-111111111104',1,3),
  ('13131313-1313-1313-1313-131313131347','Blenders','blenders','12121212-1212-1212-1212-121212121211',2,1),
  ('13131313-1313-1313-1313-131313131348','Coffee Makers','coffee-makers','12121212-1212-1212-1212-121212121211',2,2),
  ('13131313-1313-1313-1313-131313131349','Toasters','toasters','12121212-1212-1212-1212-121212121211',2,3),
  ('13131313-1313-1313-1313-131313131350','Electric Kettles','electric-kettles','12121212-1212-1212-1212-121212121211',2,4),
  -- Home Décor → Wall Art
  ('12121212-1212-1212-1212-121212121212','Wall Art','wall-art','11111111-1111-1111-1111-111111111110',1,1),
  ('13131313-1313-1313-1313-131313131351','Paintings','paintings','12121212-1212-1212-1212-121212121212',2,1),
  ('13131313-1313-1313-1313-131313131352','Wall Decorations','wall-decorations','12121212-1212-1212-1212-121212121212',2,2),
  ('13131313-1313-1313-1313-131313131353','Frames','frames','12121212-1212-1212-1212-121212121212',2,3),
  -- Home Décor → Mirrors
  ('12121212-1212-1212-1212-121212121213','Mirrors','mirrors','11111111-1111-1111-1111-111111111110',1,2),
  ('13131313-1313-1313-1313-131313131354','Wall Mirrors','wall-mirrors','12121212-1212-1212-1212-121212121213',2,1),
  ('13131313-1313-1313-1313-131313131355','Full-Length Mirrors','full-length-mirrors','12121212-1212-1212-1212-121212121213',2,2),
  -- Home Décor → Decorative Objects
  ('12121212-1212-1212-1212-121212121214','Decorative Objects','decorative-objects','11111111-1111-1111-1111-111111111110',1,3),
  ('13131313-1313-1313-1313-131313131356','Vases','vases','12121212-1212-1212-1212-121212121214',2,1),
  ('13131313-1313-1313-1313-131313131357','Ornaments','ornaments','12121212-1212-1212-1212-121212121214',2,2),
  ('13131313-1313-1313-1313-131313131358','Figurines','figurines','12121212-1212-1212-1212-121212121214',2,3),
  -- Lighting → Ceiling Lighting
  ('12121212-1212-1212-1212-121212121215','Ceiling Lighting','ceiling-lighting','11111111-1111-1111-1111-111111111111',1,1),
  ('13131313-1313-1313-1313-131313131359','Chandeliers','chandeliers','12121212-1212-1212-1212-121212121215',2,1),
  ('13131313-1313-1313-1313-131313131360','Ceiling Lamps','ceiling-lamps','12121212-1212-1212-1212-121212121215',2,2),
  ('13131313-1313-1313-1313-131313131361','Pendant Lights','pendant-lights','12121212-1212-1212-1212-121212121215',2,3),
  -- Lighting → Lamps
  ('12121212-1212-1212-1212-121212121216','Lamps','lamps','11111111-1111-1111-1111-111111111111',1,2),
  ('13131313-1313-1313-1313-131313131362','Floor Lamps','floor-lamps','12121212-1212-1212-1212-121212121216',2,1),
  ('13131313-1313-1313-1313-131313131363','Table Lamps','table-lamps','12121212-1212-1212-1212-121212121216',2,2),
  ('13131313-1313-1313-1313-131313131364','Desk Lamps','desk-lamps','12121212-1212-1212-1212-121212121216',2,3),
  -- Lighting → Outdoor Lighting
  ('12121212-1212-1212-1212-121212121217','Outdoor Lighting','outdoor-lighting','11111111-1111-1111-1111-111111111111',1,3),
  ('13131313-1313-1313-1313-131313131365','Garden Lights','garden-lights','12121212-1212-1212-1212-121212121217',2,1),
  ('13131313-1313-1313-1313-131313131366','Security Lights','security-lights','12121212-1212-1212-1212-121212121217',2,2),
  -- Bathroom → Fixtures
  ('12121212-1212-1212-1212-121212121218','Fixtures','fixtures','11111111-1111-1111-1111-111111111112',1,1),
  ('13131313-1313-1313-1313-131313131367','Sinks','sinks','12121212-1212-1212-1212-121212121218',2,1),
  ('13131313-1313-1313-1313-131313131368','Toilets','toilets','12121212-1212-1212-1212-121212121218',2,2),
  ('13131313-1313-1313-1313-131313131369','Faucets','faucets','12121212-1212-1212-1212-121212121218',2,3),
  -- Bathroom → Storage
  ('12121212-1212-1212-1212-121212121219','Storage','bathroom-storage','11111111-1111-1111-1111-111111111112',1,2),
  ('13131313-1313-1313-1313-131313131370','Bathroom Cabinets','bathroom-cabinets','12121212-1212-1212-1212-121212121219',2,1),
  ('13131313-1313-1313-1313-131313131371','Bathroom Shelves','bathroom-shelves','12121212-1212-1212-1212-121212121219',2,2),
  -- Bathroom → Bathroom Accessories
  ('12121212-1212-1212-1212-121212121220','Bathroom Accessories','bathroom-accessories','11111111-1111-1111-1111-111111111112',1,3),
  ('13131313-1313-1313-1313-131313131372','Mirrors','bathroom-mirrors','12121212-1212-1212-1212-121212121220',2,1),
  ('13131313-1313-1313-1313-131313131373','Towel Sets','towel-sets','12121212-1212-1212-1212-121212121220',2,2),
  ('13131313-1313-1313-1313-131313131374','Shower Accessories','shower-accessories','12121212-1212-1212-1212-121212121220',2,3),
  -- Curtains, Rugs & Mats → Curtains
  ('12121212-1212-1212-1212-121212121221','Curtains','curtains','11111111-1111-1111-1111-111111111113',1,1),
  ('13131313-1313-1313-1313-131313131375','Blackout Curtains','blackout-curtains','12121212-1212-1212-1212-121212121221',2,1),
  ('13131313-1313-1313-1313-131313131376','Sheer Curtains','sheer-curtains','12121212-1212-1212-1212-121212121221',2,2),
  ('13131313-1313-1313-1313-131313131377','Regular Curtains','regular-curtains','12121212-1212-1212-1212-121212121221',2,3),
  -- Curtains, Rugs & Mats → Rugs & Carpets
  ('12121212-1212-1212-1212-121212121222','Rugs & Carpets','rugs-carpets','11111111-1111-1111-1111-111111111113',1,2),
  ('13131313-1313-1313-1313-131313131378','Area Rugs','area-rugs','12121212-1212-1212-1212-121212121222',2,1),
  ('13131313-1313-1313-1313-131313131379','Persian-style Rugs','persian-style-rugs','12121212-1212-1212-1212-121212121222',2,2),
  ('13131313-1313-1313-1313-131313131380','Carpets','carpets','12121212-1212-1212-1212-121212121222',2,3),
  -- Curtains, Rugs & Mats → Mats
  ('12121212-1212-1212-1212-121212121223','Mats','mats','11111111-1111-1111-1111-111111111113',1,3),
  ('13131313-1313-1313-1313-131313131381','Floor Mats','floor-mats','12121212-1212-1212-1212-121212121223',2,1),
  ('13131313-1313-1313-1313-131313131382','Door Mats','door-mats','12121212-1212-1212-1212-121212121223',2,2),
  ('13131313-1313-1313-1313-131313131383','Prayer Mats','prayer-mats','12121212-1212-1212-1212-121212121223',2,3),
  -- Baby & Kids → Kids Furniture
  ('12121212-1212-1212-1212-121212121224','Kids Furniture','kids-furniture','11111111-1111-1111-1111-111111111114',1,1),
  ('13131313-1313-1313-1313-131313131384','Kids Beds','kids-beds','12121212-1212-1212-1212-121212121224',2,1),
  ('13131313-1313-1313-1313-131313131385','Kids Tables & Chairs','kids-tables-chairs','12121212-1212-1212-1212-121212121224',2,2),
  ('13131313-1313-1313-1313-131313131386','Toy Storage','toy-storage','12121212-1212-1212-1212-121212121224',2,3),
  -- Baby & Kids → Baby Gear
  ('12121212-1212-1212-1212-121212121225','Baby Gear','baby-gear','11111111-1111-1111-1111-111111111114',1,2),
  ('13131313-1313-1313-1313-131313131387','Cribs','cribs','12121212-1212-1212-1212-121212121225',2,1),
  ('13131313-1313-1313-1313-131313131388','Strollers','strollers','12121212-1212-1212-1212-121212121225',2,2),
  ('13131313-1313-1313-1313-131313131389','High Chairs','high-chairs','12121212-1212-1212-1212-121212121225',2,3),
  -- Baby & Kids → Toys
  ('12121212-1212-1212-1212-121212121226','Toys','toys','11111111-1111-1111-1111-111111111114',1,3),
  ('13131313-1313-1313-1313-131313131390','Educational Toys','educational-toys','12121212-1212-1212-1212-121212121226',2,1),
  ('13131313-1313-1313-1313-131313131391','Other Toys','other-toys','12121212-1212-1212-1212-121212121226',2,2),
  -- Tools & DIY → Hand Tools
  ('12121212-1212-1212-1212-121212121227','Hand Tools','hand-tools','11111111-1111-1111-1111-111111111115',1,1),
  ('13131313-1313-1313-1313-131313131392','Toolkits','toolkits','12121212-1212-1212-1212-121212121227',2,1),
  ('13131313-1313-1313-1313-131313131393','Hammers','hammers','12121212-1212-1212-1212-121212121227',2,2),
  ('13131313-1313-1313-1313-131313131394','Screwdrivers','screwdrivers','12121212-1212-1212-1212-121212121227',2,3),
  -- Tools & DIY → Power Tools
  ('12121212-1212-1212-1212-121212121228','Power Tools','power-tools','11111111-1111-1111-1111-111111111115',1,2),
  ('13131313-1313-1313-1313-131313131395','Drills','drills','12121212-1212-1212-1212-121212121228',2,1),
  ('13131313-1313-1313-1313-131313131396','Sanders','sanders','12121212-1212-1212-1212-121212121228',2,2),
  ('13131313-1313-1313-1313-131313131397','Grinders','grinders','12121212-1212-1212-1212-121212121228',2,3),
  -- Home Improvement → Doors & Windows
  ('12121212-1212-1212-1212-121212121229','Doors & Windows','doors-windows','11111111-1111-1111-1111-111111111116',1,1),
  ('13131313-1313-1313-1313-131313131398','Doors','doors','12121212-1212-1212-1212-121212121229',2,1),
  ('13131313-1313-1313-1313-131313131399','Windows','windows','12121212-1212-1212-1212-121212121229',2,2),
  ('13131313-1313-1313-1313-131313131400','Door Hardware','door-hardware','12121212-1212-1212-1212-121212121229',2,3),
  -- Home Improvement → Fixtures
  ('12121212-1212-1212-1212-121212121230','Fixtures','improvement-fixtures','11111111-1111-1111-1111-111111111116',1,2),
  ('13131313-1313-1313-1313-131313131401','Faucets','improvement-faucets','12121212-1212-1212-1212-121212121230',2,1),
  ('13131313-1313-1313-1313-131313131402','Handles','handles','12121212-1212-1212-1212-121212121230',2,2),
  ('13131313-1313-1313-1313-131313131403','Hardware','hardware','12121212-1212-1212-1212-121212121230',2,3),
  -- Home Improvement → Other Home Improvement (L1, no children — L2 is optional)
  ('12121212-1212-1212-1212-121212121231','Other Home Improvement','other-home-improvement','11111111-1111-1111-1111-111111111116',1,3)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      parent_id = EXCLUDED.parent_id,
      level = EXCLUDED.level,
      sort_order = EXCLUDED.sort_order;

-- Existing child rows were inserted without explicit level; ensure they are
-- tagged level 2 under their (now level 1) parents.
UPDATE public.categories c
SET level = 2
WHERE level = 1
  AND parent_id IS NOT NULL
  AND (SELECT level FROM public.categories p WHERE p.id = c.parent_id) = 1;
