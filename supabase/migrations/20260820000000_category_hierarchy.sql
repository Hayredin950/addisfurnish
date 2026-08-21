-- =========================================================================
-- Phase 2: Dynamic 3-level category hierarchy
--   * Extend categories with level/is_active/description/image_url/timestamps
--   * Server-side depth + parent-level validation
--   * Replace the old 2-level seed with the full household-oriented taxonomy
--   * Is_active enforcement for NEW listings (existing listings are preserved)
--   * Old category rows are replaced; demo listings are remapped by slug
-- =========================================================================

-- ── 1. Extend the categories table ─────────────────────────────────────────
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.categories ADD CONSTRAINT categories_level_range CHECK (level BETWEEN 0 AND 2);
ALTER TABLE public.categories ADD CONSTRAINT categories_level0_root CHECK (level = 0 OR parent_id IS NOT NULL);

CREATE TRIGGER categories_updated BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. Server-side hierarchy validation ────────────────────────────────────
-- level is DERIVED from the parent: root(0) -> child(1) -> child(2).
-- Depth is capped at 2 (max three levels). A row can never be placed under a
-- level-2 node, so a level 2 must have a level 1 parent and so on.
CREATE OR REPLACE FUNCTION public.validate_category_hierarchy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  p_level integer;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.level := 0;
  ELSE
    SELECT level INTO p_level FROM public.categories WHERE id = NEW.parent_id;
    IF p_level IS NULL THEN
      RAISE EXCEPTION 'parent category % does not exist', NEW.parent_id;
    END IF;
    IF p_level >= 2 THEN
      RAISE EXCEPTION 'category depth exceeds 2 (maximum of three levels)';
    END IF;
    NEW.level := p_level + 1;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS categories_hierarchy_validate ON public.categories;
CREATE TRIGGER categories_hierarchy_validate
  BEFORE INSERT OR UPDATE OF parent_id, id ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.validate_category_hierarchy();

-- ── 3. Replace the old seed + remap demo listings ──────────────────────────
-- Capture the old slug on each listing, then rebuild the category tree and
-- restore listings to the matching NEW leaf slug.
DROP TRIGGER IF EXISTS listings_category_active ON public.listings;

CREATE TEMP TABLE _listing_old_cat AS
  SELECT l.id AS listing_id, c.slug AS slug
  FROM public.listings l
  JOIN public.categories c ON c.id = l.category_id;

-- FK is ON DELETE SET NULL, so this safely clears listings.category_id.
DELETE FROM public.categories;

-- Drop the policy that was created on the old table definition if present,
-- then recreate the admin-management + public-read policies after the reseed.
DROP POLICY IF EXISTS "categories public read" ON public.categories;
DROP POLICY IF EXISTS "admins manage categories" ON public.categories;

-- ── 4. Seed the full 3-level taxonomy ──────────────────────────────────────
-- Roots (level 0)
INSERT INTO public.categories (name, slug, icon, sort_order, description) VALUES
  ('Furniture','furniture','sofa',1,'የቤት ዕቃዎች | Home furniture and furnishing pieces'),
  ('Appliances','appliances','archive',2,'የቤት መገልገያ | Household appliances'),
  ('Electronics & Entertainment','electronics-entertainment','tv',3,'መረጃና መዝናኛ | TVs, audio and gaming'),
  ('Kitchen & Dining','kitchen-dining','utensils',4,'ኩሽና እና መመገቢያ | Cookware, dishes and small appliances'),
  ('Home Décor','home-decor','lamp',5,'የቤት ማስዋቢያ | Wall art, mirrors and decor'),
  ('Lighting','lighting','lamp',6,'መብራት | Lamps and lighting fixtures'),
  ('Bathroom','bathroom','trees',7,'መታጠቢያ ቤት | Bathroom fixtures and accessories'),
  ('Curtains, Rugs & Mats','curtains-rugs-mats','bookshelf',8,'መጋረጃ፣ ምንጣፍ | Curtains, carpets, rugs and mats'),
  ('Baby & Kids','baby-kids','bed',9,'የልጆች | Kids furniture, baby gear and toys'),
  ('Tools & DIY','tools-diy','briefcase',10,'መሳሪያዎች | Hand and power tools'),
  ('Home Improvement','home-improvement','briefcase',11,'የቤት ማሻሻያ | Doors, windows and fixtures');

-- Furniture -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
  ('Living Room','living-room',(SELECT id FROM public.categories WHERE slug='furniture'),1,'ሳሎን'),
  ('Bedroom','bedroom',(SELECT id FROM public.categories WHERE slug='furniture'),2,'መኝታ ክፍል'),
  ('Dining','dining',(SELECT id FROM public.categories WHERE slug='furniture'),3,'መመገቢያ'),
  ('Office','office',(SELECT id FROM public.categories WHERE slug='furniture'),4,'ቢሮ'),
  ('Outdoor','outdoor',(SELECT id FROM public.categories WHERE slug='furniture'),5,'ከቤት ውጭ'),
  ('Storage','storage',(SELECT id FROM public.categories WHERE slug='furniture'),6,'ማከማቻ');

-- Furniture -> Living Room -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Sofas','sofas',(SELECT id FROM public.categories WHERE slug='living-room'),1),
  ('Majlis / Floor Seating','majlis-floor-seating',(SELECT id FROM public.categories WHERE slug='living-room'),2),
  ('Coffee Tables','coffee-tables',(SELECT id FROM public.categories WHERE slug='living-room'),3),
  ('TV Stands','tv-stands',(SELECT id FROM public.categories WHERE slug='living-room'),4),
  ('Armchairs','armchairs',(SELECT id FROM public.categories WHERE slug='living-room'),5),
  ('Side Tables','side-tables',(SELECT id FROM public.categories WHERE slug='living-room'),6);
-- Furniture -> Bedroom -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Beds','beds',(SELECT id FROM public.categories WHERE slug='bedroom'),1),
  ('Wardrobes','wardrobes',(SELECT id FROM public.categories WHERE slug='bedroom'),2),
  ('Bedside Tables','bedside-tables',(SELECT id FROM public.categories WHERE slug='bedroom'),3),
  ('Dressers','dressers',(SELECT id FROM public.categories WHERE slug='bedroom'),4),
  ('Mattresses','mattresses',(SELECT id FROM public.categories WHERE slug='bedroom'),5);
-- Furniture -> Dining -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Dining Tables','dining-tables',(SELECT id FROM public.categories WHERE slug='dining'),1),
  ('Dining Chairs','dining-chairs',(SELECT id FROM public.categories WHERE slug='dining'),2),
  ('Dining Sets','dining-sets',(SELECT id FROM public.categories WHERE slug='dining'),3);
-- Furniture -> Office -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Desks','desks',(SELECT id FROM public.categories WHERE slug='office'),1),
  ('Office Chairs','office-chairs',(SELECT id FROM public.categories WHERE slug='office'),2),
  ('Filing Cabinets','filing-cabinets',(SELECT id FROM public.categories WHERE slug='office'),3),
  ('Bookcases','bookcases',(SELECT id FROM public.categories WHERE slug='office'),4);
-- Furniture -> Outdoor -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Patio Sets','patio-sets',(SELECT id FROM public.categories WHERE slug='outdoor'),1),
  ('Outdoor Chairs','outdoor-chairs',(SELECT id FROM public.categories WHERE slug='outdoor'),2),
  ('Outdoor Tables','outdoor-tables',(SELECT id FROM public.categories WHERE slug='outdoor'),3);
-- Furniture -> Storage -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Shelving Units','shelving-units',(SELECT id FROM public.categories WHERE slug='storage'),1),
  ('Storage Cabinets','storage-cabinets',(SELECT id FROM public.categories WHERE slug='storage'),2),
  ('Storage Boxes','storage-boxes',(SELECT id FROM public.categories WHERE slug='storage'),3),
  ('Organizers','organizers',(SELECT id FROM public.categories WHERE slug='storage'),4);

-- Appliances -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Kitchen','kitchen',(SELECT id FROM public.categories WHERE slug='appliances'),1),
  ('Laundry','laundry',(SELECT id FROM public.categories WHERE slug='appliances'),2),
  ('Cooling & Heating','cooling-heating',(SELECT id FROM public.categories WHERE slug='appliances'),3),
  ('Cleaning','cleaning',(SELECT id FROM public.categories WHERE slug='appliances'),4);
-- Appliances -> Kitchen -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Refrigerators','refrigerators',(SELECT id FROM public.categories WHERE slug='kitchen'),1),
  ('Freezers','freezers',(SELECT id FROM public.categories WHERE slug='kitchen'),2),
  ('Ovens','ovens',(SELECT id FROM public.categories WHERE slug='kitchen'),3),
  ('Cookers','cookers',(SELECT id FROM public.categories WHERE slug='kitchen'),4),
  ('Microwaves','microwaves',(SELECT id FROM public.categories WHERE slug='kitchen'),5),
  ('Dishwashers','dishwashers',(SELECT id FROM public.categories WHERE slug='kitchen'),6);
-- Appliances -> Laundry -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Washing Machines','washing-machines',(SELECT id FROM public.categories WHERE slug='laundry'),1),
  ('Dryers','dryers',(SELECT id FROM public.categories WHERE slug='laundry'),2),
  ('Irons','irons',(SELECT id FROM public.categories WHERE slug='laundry'),3);
-- Appliances -> Cooling & Heating -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Air Conditioners','air-conditioners',(SELECT id FROM public.categories WHERE slug='cooling-heating'),1),
  ('Fans','fans',(SELECT id FROM public.categories WHERE slug='cooling-heating'),2),
  ('Heaters','heaters',(SELECT id FROM public.categories WHERE slug='cooling-heating'),3),
  ('Electric Heaters','electric-heaters',(SELECT id FROM public.categories WHERE slug='cooling-heating'),4);
-- Appliances -> Cleaning -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Vacuum Cleaners','vacuum-cleaners',(SELECT id FROM public.categories WHERE slug='cleaning'),1),
  ('Carpet Cleaners','carpet-cleaners',(SELECT id FROM public.categories WHERE slug='cleaning'),2);

-- Electronics & Entertainment -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('TVs & Displays','tvs-displays',(SELECT id FROM public.categories WHERE slug='electronics-entertainment'),1),
  ('Audio','audio',(SELECT id FROM public.categories WHERE slug='electronics-entertainment'),2),
  ('Gaming','gaming',(SELECT id FROM public.categories WHERE slug='electronics-entertainment'),3);
-- Electronics & Entertainment -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Televisions','televisions',(SELECT id FROM public.categories WHERE slug='tvs-displays'),1),
  ('Monitors','monitors',(SELECT id FROM public.categories WHERE slug='tvs-displays'),2),
  ('Projectors','projectors',(SELECT id FROM public.categories WHERE slug='tvs-displays'),3),
  ('Speakers','speakers',(SELECT id FROM public.categories WHERE slug='audio'),1),
  ('Home Theater','home-theater',(SELECT id FROM public.categories WHERE slug='audio'),2),
  ('Amplifiers','amplifiers',(SELECT id FROM public.categories WHERE slug='audio'),3),
  ('Headphones','headphones',(SELECT id FROM public.categories WHERE slug='audio'),4),
  ('Game Consoles','game-consoles',(SELECT id FROM public.categories WHERE slug='gaming'),1),
  ('Controllers','controllers',(SELECT id FROM public.categories WHERE slug='gaming'),2),
  ('Gaming Accessories','gaming-accessories',(SELECT id FROM public.categories WHERE slug='gaming'),3);

-- Kitchen & Dining -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Cookware','cookware',(SELECT id FROM public.categories WHERE slug='kitchen-dining'),1),
  ('Dishes & Cutlery','dishes-cutlery',(SELECT id FROM public.categories WHERE slug='kitchen-dining'),2),
  ('Small Kitchen Appliances','small-kitchen-appliances',(SELECT id FROM public.categories WHERE slug='kitchen-dining'),3);
-- Kitchen & Dining -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Pots & Pans','pots-pans',(SELECT id FROM public.categories WHERE slug='cookware'),1),
  ('Pressure Cookers','pressure-cookers',(SELECT id FROM public.categories WHERE slug='cookware'),2),
  ('Baking Equipment','baking-equipment',(SELECT id FROM public.categories WHERE slug='cookware'),3),
  ('Plates','plates',(SELECT id FROM public.categories WHERE slug='dishes-cutlery'),1),
  ('Cups & Glasses','cups-glasses',(SELECT id FROM public.categories WHERE slug='dishes-cutlery'),2),
  ('Cutlery Sets','cutlery-sets',(SELECT id FROM public.categories WHERE slug='dishes-cutlery'),3),
  ('Blenders','blenders',(SELECT id FROM public.categories WHERE slug='small-kitchen-appliances'),1),
  ('Coffee Makers','coffee-makers',(SELECT id FROM public.categories WHERE slug='small-kitchen-appliances'),2),
  ('Toasters','toasters',(SELECT id FROM public.categories WHERE slug='small-kitchen-appliances'),3),
  ('Electric Kettles','electric-kettles',(SELECT id FROM public.categories WHERE slug='small-kitchen-appliances'),4);

-- Home Décor -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Wall Art','wall-art',(SELECT id FROM public.categories WHERE slug='home-decor'),1),
  ('Mirrors','mirrors',(SELECT id FROM public.categories WHERE slug='home-decor'),2),
  ('Decorative Objects','decorative-objects',(SELECT id FROM public.categories WHERE slug='home-decor'),3);
-- Home Décor -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Paintings','paintings',(SELECT id FROM public.categories WHERE slug='wall-art'),1),
  ('Wall Decorations','wall-decorations',(SELECT id FROM public.categories WHERE slug='wall-art'),2),
  ('Frames','frames',(SELECT id FROM public.categories WHERE slug='wall-art'),3),
  ('Wall Mirrors','wall-mirrors',(SELECT id FROM public.categories WHERE slug='mirrors'),1),
  ('Full-Length Mirrors','full-length-mirrors',(SELECT id FROM public.categories WHERE slug='mirrors'),2),
  ('Vases','vases',(SELECT id FROM public.categories WHERE slug='decorative-objects'),1),
  ('Ornaments','ornaments',(SELECT id FROM public.categories WHERE slug='decorative-objects'),2),
  ('Figurines','figurines',(SELECT id FROM public.categories WHERE slug='decorative-objects'),3);

-- Lighting -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Ceiling Lighting','ceiling-lighting',(SELECT id FROM public.categories WHERE slug='lighting'),1),
  ('Lamps','lamps',(SELECT id FROM public.categories WHERE slug='lighting'),2),
  ('Outdoor Lighting','outdoor-lighting',(SELECT id FROM public.categories WHERE slug='lighting'),3);
-- Lighting -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Chandeliers','chandeliers',(SELECT id FROM public.categories WHERE slug='ceiling-lighting'),1),
  ('Ceiling Lamps','ceiling-lamps',(SELECT id FROM public.categories WHERE slug='ceiling-lighting'),2),
  ('Pendant Lights','pendant-lights',(SELECT id FROM public.categories WHERE slug='ceiling-lighting'),3),
  ('Floor Lamps','floor-lamps',(SELECT id FROM public.categories WHERE slug='lamps'),1),
  ('Table Lamps','table-lamps',(SELECT id FROM public.categories WHERE slug='lamps'),2),
  ('Desk Lamps','desk-lamps',(SELECT id FROM public.categories WHERE slug='lamps'),3),
  ('Garden Lights','garden-lights',(SELECT id FROM public.categories WHERE slug='outdoor-lighting'),1),
  ('Security Lights','security-lights',(SELECT id FROM public.categories WHERE slug='outdoor-lighting'),2);

-- Bathroom -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Fixtures','fixtures',(SELECT id FROM public.categories WHERE slug='bathroom'),1),
  ('Storage','bathroom-storage',(SELECT id FROM public.categories WHERE slug='bathroom'),2),
  ('Bathroom Accessories','bathroom-accessories',(SELECT id FROM public.categories WHERE slug='bathroom'),3);
-- Bathroom -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Sinks','sinks',(SELECT id FROM public.categories WHERE slug='fixtures'),1),
  ('Toilets','toilets',(SELECT id FROM public.categories WHERE slug='fixtures'),2),
  ('Faucets','faucets',(SELECT id FROM public.categories WHERE slug='fixtures'),3),
  ('Bathroom Cabinets','bathroom-cabinets',(SELECT id FROM public.categories WHERE slug='bathroom-storage'),1),
  ('Bathroom Shelves','bathroom-shelves',(SELECT id FROM public.categories WHERE slug='bathroom-storage'),2),
  ('Mirrors','bathroom-mirrors',(SELECT id FROM public.categories WHERE slug='bathroom-accessories'),1),
  ('Towel Sets','towel-sets',(SELECT id FROM public.categories WHERE slug='bathroom-accessories'),2),
  ('Shower Accessories','shower-accessories',(SELECT id FROM public.categories WHERE slug='bathroom-accessories'),3);

-- Curtains, Rugs & Mats -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Curtains','curtains',(SELECT id FROM public.categories WHERE slug='curtains-rugs-mats'),1),
  ('Rugs & Carpets','rugs-carpets',(SELECT id FROM public.categories WHERE slug='curtains-rugs-mats'),2),
  ('Mats','mats',(SELECT id FROM public.categories WHERE slug='curtains-rugs-mats'),3);
-- Curtains, Rugs & Mats -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Blackout Curtains','blackout-curtains',(SELECT id FROM public.categories WHERE slug='curtains'),1),
  ('Sheer Curtains','sheer-curtains',(SELECT id FROM public.categories WHERE slug='curtains'),2),
  ('Regular Curtains','regular-curtains',(SELECT id FROM public.categories WHERE slug='curtains'),3),
  ('Area Rugs','area-rugs',(SELECT id FROM public.categories WHERE slug='rugs-carpets'),1),
  ('Persian-style Rugs','persian-rugs',(SELECT id FROM public.categories WHERE slug='rugs-carpets'),2),
  ('Carpets','carpets',(SELECT id FROM public.categories WHERE slug='rugs-carpets'),3),
  ('Floor Mats','floor-mats',(SELECT id FROM public.categories WHERE slug='mats'),1),
  ('Door Mats','door-mats',(SELECT id FROM public.categories WHERE slug='mats'),2),
  ('Prayer Mats','prayer-mats',(SELECT id FROM public.categories WHERE slug='mats'),3);

-- Baby & Kids -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Kids Furniture','kids-furniture',(SELECT id FROM public.categories WHERE slug='baby-kids'),1),
  ('Baby Gear','baby-gear',(SELECT id FROM public.categories WHERE slug='baby-kids'),2),
  ('Toys','toys',(SELECT id FROM public.categories WHERE slug='baby-kids'),3);
-- Baby & Kids -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Kids Beds','kids-beds',(SELECT id FROM public.categories WHERE slug='kids-furniture'),1),
  ('Kids Tables & Chairs','kids-tables-chairs',(SELECT id FROM public.categories WHERE slug='kids-furniture'),2),
  ('Toy Storage','toy-storage',(SELECT id FROM public.categories WHERE slug='kids-furniture'),3),
  ('Cribs','cribs',(SELECT id FROM public.categories WHERE slug='baby-gear'),1),
  ('Strollers','strollers',(SELECT id FROM public.categories WHERE slug='baby-gear'),2),
  ('High Chairs','high-chairs',(SELECT id FROM public.categories WHERE slug='baby-gear'),3),
  ('Educational Toys','educational-toys',(SELECT id FROM public.categories WHERE slug='toys'),1),
  ('Other Toys','other-toys',(SELECT id FROM public.categories WHERE slug='toys'),2);

-- Tools & DIY -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Hand Tools','hand-tools',(SELECT id FROM public.categories WHERE slug='tools-diy'),1),
  ('Power Tools','power-tools',(SELECT id FROM public.categories WHERE slug='tools-diy'),2);
-- Tools & DIY -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Toolkits','toolkits',(SELECT id FROM public.categories WHERE slug='hand-tools'),1),
  ('Hammers','hammers',(SELECT id FROM public.categories WHERE slug='hand-tools'),2),
  ('Screwdrivers','screwdrivers',(SELECT id FROM public.categories WHERE slug='hand-tools'),3),
  ('Drills','drills',(SELECT id FROM public.categories WHERE slug='power-tools'),1),
  ('Sanders','sanders',(SELECT id FROM public.categories WHERE slug='power-tools'),2),
  ('Grinders','grinders',(SELECT id FROM public.categories WHERE slug='power-tools'),3);

-- Home Improvement -> Level 1
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Doors & Windows','doors-windows',(SELECT id FROM public.categories WHERE slug='home-improvement'),1),
  ('Fixtures','home-fixtures',(SELECT id FROM public.categories WHERE slug='home-improvement'),2),
  ('Other Home Improvement','other-home-improvement',(SELECT id FROM public.categories WHERE slug='home-improvement'),3);
-- Home Improvement -> Level 2
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Doors','doors',(SELECT id FROM public.categories WHERE slug='doors-windows'),1),
  ('Windows','windows',(SELECT id FROM public.categories WHERE slug='doors-windows'),2),
  ('Door Hardware','door-hardware',(SELECT id FROM public.categories WHERE slug='doors-windows'),3),
  ('Faucets','home-faucets',(SELECT id FROM public.categories WHERE slug='home-fixtures'),1),
  ('Handles','handles',(SELECT id FROM public.categories WHERE slug='home-fixtures'),2),
  ('Hardware','home-hardware',(SELECT id FROM public.categories WHERE slug='home-fixtures'),3);

-- ── 5. Remap demo listings to their new leaf categories ──────────────────
-- Recreate the public read + admin management policies.
CREATE POLICY "categories public read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "admins manage categories" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

UPDATE public.listings l
SET category_id = nc.id
FROM _listing_old_cat old
JOIN public.categories nc ON nc.slug = old.slug
WHERE l.id = old.listing_id;

DROP TABLE _listing_old_cat;

-- ── 6. Enforce active-category on NEW listings (preserve existing) ────────
CREATE OR REPLACE FUNCTION public.validate_listing_category_active()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.categories
                    WHERE id = NEW.category_id AND is_active = true) THEN
      RAISE EXCEPTION 'inactive category cannot be used for new listings';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER listings_category_active
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.validate_listing_category_active();

-- ── 7. Recursive descendants + updated counts view (3-level aware) ────────
CREATE OR REPLACE FUNCTION public.category_descendant_ids(_root uuid)
RETURNS uuid[] LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE tree(id) AS (
    SELECT id FROM public.categories WHERE id = _root
    UNION ALL
    SELECT c.id FROM public.categories c JOIN tree t ON t.id = c.parent_id
  )
  SELECT array_agg(id) FROM tree;
$$;

-- A category's count now includes ALL descendants (max three levels).
CREATE OR REPLACE VIEW public.category_listing_counts
WITH (security_invoker = true) AS
SELECT
  c.id   AS category_id,
  c.slug AS category_slug,
  COUNT(l.id) AS listing_count
FROM public.categories c
LEFT JOIN public.listings l
  ON (l.status = 'active'
      AND l.category_id = ANY(public.category_descendant_ids(c.id)))
GROUP BY c.id, c.slug;

GRANT SELECT ON public.category_listing_counts TO anon, authenticated;