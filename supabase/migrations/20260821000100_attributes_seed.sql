-- ── Phase 4b: seed the initial attribute catalogue ─────────────────────────
-- Everything here is data, not schema: an admin can add/rename/deactivate any
-- of it later from the admin UI with no code change (spec §4, §10).
--
-- Categories are matched by SLUG, never by hardcoded id — the pre-existing
-- rows carry database-generated ids that must not change (spec §1).

-- ── 1) Attribute catalogue (spec §8, §13) ──────────────────────────────────
INSERT INTO public.attributes (slug, name, name_am, type, unit, is_filterable, sort_order) VALUES
  ('condition',      'Condition',       'ሁኔታ',           'single_select', NULL,   true,  1),
  ('brand',          'Brand',           'ብራንድ',          'single_select', NULL,   true,  2),
  ('model',          'Model',           'ሞዴል',           'text',          NULL,   false, 3),
  ('material',       'Material',        'ቁሳቁስ',          'single_select', NULL,   true,  4),
  ('color',          'Color',           'ቀለም',           'single_select', NULL,   true,  5),
  ('seat-count',     'Number of Seats', 'የመቀመጫ ብዛት',     'number',        NULL,   true,  6),
  ('shape',          'Shape',           'ቅርፅ',           'single_select', NULL,   true,  7),
  ('width',          'Width',           'ስፋት',           'number',        'cm',   true,  8),
  ('length',         'Length',          'ርዝመት',          'number',        'cm',   true,  9),
  ('height',         'Height',          'ቁመት',           'number',        'cm',   false, 10),
  ('capacity',       'Capacity',        'አቅም',           'number',        'L',    true,  11),
  ('energy-type',    'Energy Type',     'የኃይል ዓይነት',     'single_select', NULL,   true,  12),
  ('working-status', 'Working Status',  'የሥራ ሁኔታ',       'single_select', NULL,   true,  13),
  ('age',            'Age',             'ዕድሜ',           'number',        'years', true, 14),
  ('screen-size',    'Screen Size',     'የስክሪን መጠን',     'number',        'in',   true,  15),
  ('display-type',   'Display Type',    'የስክሪን ዓይነት',    'single_select', NULL,   true,  16),
  ('resolution',     'Resolution',      'ሬዞሉሽን',         'single_select', NULL,   true,  17),
  ('smart-tv',       'Smart TV',        'ስማርት ቲቪ',       'boolean',       NULL,   true,  18),
  ('pattern',        'Pattern',         'ንድፍ',           'single_select', NULL,   true,  19),
  ('machine-type',   'Type',            'ዓይነት',          'single_select', NULL,   true,  20),
  ('power',          'Power',           'ኃይል',           'number',        'W',    false, 21)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, name_am = EXCLUDED.name_am, type = EXCLUDED.type,
      unit = EXCLUDED.unit, is_filterable = EXCLUDED.is_filterable,
      sort_order = EXCLUDED.sort_order;

-- ── 2) Options for the select attributes (spec §10) ────────────────────────
INSERT INTO public.attribute_options (attribute_id, value, label, label_am, sort_order)
SELECT a.id, o.value, o.label, o.label_am, o.sort_order
FROM (VALUES
  -- Condition — mirrors the existing listings.condition values
  ('condition','new','New','አዲስ',1),
  ('condition','like-new','Like New','እንደ አዲስ',2),
  ('condition','good','Good','ጥሩ',3),
  ('condition','fair','Fair','መካከለኛ',4),
  ('condition','needs-repair','Needs Repair','ጥገና ይፈልጋል',5),
  -- Material
  ('material','wood','Wood','እንጨት',1),
  ('material','metal','Metal','ብረት',2),
  ('material','plastic','Plastic','ፕላስቲክ',3),
  ('material','leather','Leather','ቆዳ',4),
  ('material','fabric','Fabric','ጨርቅ',5),
  ('material','glass','Glass','መስታወት',6),
  ('material','marble','Marble','እብነ በረድ',7),
  ('material','rattan','Rattan / Bamboo','ሸምበቆ',8),
  -- Color
  ('color','black','Black','ጥቁር',1),
  ('color','white','White','ነጭ',2),
  ('color','grey','Grey','ግራጫ',3),
  ('color','brown','Brown','ቡናማ',4),
  ('color','beige','Beige','ቢዥ',5),
  ('color','red','Red','ቀይ',6),
  ('color','blue','Blue','ሰማያዊ',7),
  ('color','green','Green','አረንጓዴ',8),
  ('color','yellow','Yellow','ቢጫ',9),
  ('color','multicolor','Multicolor','ብዙ ቀለም',10),
  -- Shape
  ('shape','straight','Straight','ቀጥ ያለ',1),
  ('shape','l-shaped','L-shaped','L ቅርፅ',2),
  ('shape','u-shaped','U-shaped','U ቅርፅ',3),
  ('shape','round','Round','ክብ',4),
  ('shape','rectangular','Rectangular','አራት ማዕዘን',5),
  ('shape','square','Square','ካሬ',6),
  ('shape','oval','Oval','ኦቫል',7),
  -- Brand (open list; admins extend it freely)
  ('brand','samsung','Samsung','ሳምሰንግ',1),
  ('brand','lg','LG','ኤልጂ',2),
  ('brand','sony','Sony','ሶኒ',3),
  ('brand','hisense','Hisense','ሃይሰንስ',4),
  ('brand','toshiba','Toshiba','ቶሺባ',5),
  ('brand','bosch','Bosch','ቦሽ',6),
  ('brand','whirlpool','Whirlpool','ዊርልፑል',7),
  ('brand','beko','Beko','ቤኮ',8),
  ('brand','midea','Midea','ሚዲያ',9),
  ('brand','elektra','Elektra','ኤሌክትራ',10),
  ('brand','other','Other','ሌላ',99),
  -- Energy type
  ('energy-type','electric','Electric','ኤሌክትሪክ',1),
  ('energy-type','gas','Gas','ጋዝ',2),
  ('energy-type','dual','Electric + Gas','ኤሌክትሪክ እና ጋዝ',3),
  ('energy-type','solar','Solar','ሶላር',4),
  -- Working status
  ('working-status','working','Working','ይሠራል',1),
  ('working-status','partially-working','Partially Working','በከፊል ይሠራል',2),
  ('working-status','not-working','Not Working','አይሠራም',3),
  -- Display type
  ('display-type','led','LED','ኤልኢዲ',1),
  ('display-type','oled','OLED','ኦሌድ',2),
  ('display-type','qled','QLED','ኪውሌድ',3),
  ('display-type','lcd','LCD','ኤልሲዲ',4),
  ('display-type','plasma','Plasma','ፕላዝማ',5),
  -- Resolution
  ('resolution','hd','HD','ኤችዲ',1),
  ('resolution','full-hd','Full HD','ፉል ኤችዲ',2),
  ('resolution','4k','4K','4ኬ',3),
  ('resolution','8k','8K','8ኬ',4),
  -- Pattern
  ('pattern','solid','Solid','ነጠላ ቀለም',1),
  ('pattern','geometric','Geometric','ጂኦሜትሪክ',2),
  ('pattern','floral','Floral','አበባ',3),
  ('pattern','traditional','Traditional','ባህላዊ',4),
  ('pattern','abstract','Abstract','አብስትራክት',5),
  -- Washing-machine type
  ('machine-type','front-load','Front Load','ከፊት የሚከፈት',1),
  ('machine-type','top-load','Top Load','ከላይ የሚከፈት',2),
  ('machine-type','semi-automatic','Semi Automatic','ከፊል አውቶማቲክ',3),
  ('machine-type','automatic','Fully Automatic','ሙሉ አውቶማቲክ',4)
) AS o(attr_slug, value, label, label_am, sort_order)
JOIN public.attributes a ON a.slug = o.attr_slug
ON CONFLICT (attribute_id, value) DO UPDATE
  SET label = EXCLUDED.label, label_am = EXCLUDED.label_am,
      sort_order = EXCLUDED.sort_order;

-- ── 3) Attach attributes to categories (spec §9, §12, §13) ─────────────────
-- Attaching at a ROOT category applies to its whole subtree, so "Condition"
-- lands once per tree rather than on all ~140 leaves.
INSERT INTO public.category_attributes (category_id, attribute_id, is_required, is_filterable, sort_order)
SELECT c.id, a.id, m.is_required, m.is_filterable, m.sort_order
FROM (VALUES
  -- Condition is required on every root (inherited by everything below).
  ('furniture',                  'condition', true,  true,  1),
  ('appliances',                 'condition', true,  true,  1),
  ('electronics-entertainment',  'condition', true,  true,  1),
  ('kitchen-dining',             'condition', true,  true,  1),
  ('home-decor',                 'condition', true,  true,  1),
  ('lighting',                   'condition', true,  true,  1),
  ('bathroom',                   'condition', true,  true,  1),
  ('curtains-rugs-mats',         'condition', true,  true,  1),
  ('baby-kids',                  'condition', true,  true,  1),
  ('tools-diy',                  'condition', true,  true,  1),
  ('home-improvement',           'condition', true,  true,  1),

  -- Furniture: material matters everywhere; colour and size are optional.
  ('furniture', 'material', true,  true,  2),
  ('furniture', 'color',    false, true,  3),
  ('furniture', 'brand',    false, true,  4),
  ('furniture', 'width',    false, true,  5),
  ('furniture', 'length',   false, true,  6),
  ('furniture', 'height',   false, false, 7),

  -- Sofas add seat count + shape (spec §7's worked example).
  ('sofas',      'seat-count', false, true, 8),
  ('sofas',      'shape',      false, true, 9),
  ('armchairs',  'shape',      false, true, 9),
  ('majlis-floor-seating', 'seat-count', false, true, 8),

  -- Appliances: brand/working status matter, capacity where it applies.
  ('appliances',       'brand',          true,  true,  2),
  ('appliances',       'model',          false, false, 3),
  ('appliances',       'working-status', true,  true,  4),
  ('appliances',       'age',            false, true,  5),
  ('appliances',       'color',          false, true,  6),
  ('refrigerators',    'capacity',       true,  true,  7),
  ('refrigerators',    'energy-type',    false, true,  8),
  ('freezers',         'capacity',       true,  true,  7),
  ('ovens',            'energy-type',    true,  true,  7),
  ('cookers',          'energy-type',    true,  true,  7),
  ('washing-machines', 'capacity',       true,  true,  7),
  ('washing-machines', 'machine-type',   false, true,  8),
  ('dryers',           'capacity',       false, true,  7),
  ('air-conditioners', 'power',          false, false, 7),
  ('heaters',          'power',          false, false, 7),
  ('electric-heaters', 'power',          false, false, 7),

  -- Electronics
  ('electronics-entertainment', 'brand',          true,  true,  2),
  ('electronics-entertainment', 'model',          false, false, 3),
  ('electronics-entertainment', 'working-status', true,  true,  4),
  ('electronics-entertainment', 'age',            false, true,  5),
  ('televisions',               'screen-size',    true,  true,  6),
  ('televisions',               'display-type',   false, true,  7),
  ('televisions',               'resolution',     false, true,  8),
  ('televisions',               'smart-tv',       false, true,  9),
  ('monitors',                  'screen-size',    true,  true,  6),
  ('monitors',                  'resolution',     false, true,  7),

  -- Kitchen & Dining
  ('kitchen-dining',            'material', false, true, 2),
  ('kitchen-dining',            'brand',    false, true, 3),
  ('small-kitchen-appliances',  'brand',          true,  true, 3),
  ('small-kitchen-appliances',  'working-status', true,  true, 4),
  ('small-kitchen-appliances',  'power',          false, false, 5),

  -- Home décor / lighting / bathroom
  ('home-decor', 'material', false, true, 2),
  ('home-decor', 'color',    false, true, 3),
  ('lighting',   'material', false, true, 2),
  ('lighting',   'color',    false, true, 3),
  ('lighting',   'power',    false, false, 4),
  ('bathroom',   'material', false, true, 2),
  ('bathroom',   'color',    false, true, 3),

  -- Curtains, rugs & mats: size and pattern are the real differentiators.
  ('curtains-rugs-mats', 'material', true,  true, 2),
  ('curtains-rugs-mats', 'color',    false, true, 3),
  ('curtains-rugs-mats', 'pattern',  false, true, 4),
  ('curtains-rugs-mats', 'length',   false, true, 5),
  ('curtains-rugs-mats', 'width',    false, true, 6),

  -- Baby & kids
  ('baby-kids', 'brand',    false, true, 2),
  ('baby-kids', 'material', false, true, 3),
  ('baby-kids', 'color',    false, true, 4),

  -- Tools & DIY
  ('tools-diy',   'brand',          true,  true,  2),
  ('tools-diy',   'working-status', true,  true,  3),
  ('power-tools', 'power',          false, false, 4),

  -- Home improvement
  ('home-improvement', 'material', false, true, 2),
  ('home-improvement', 'color',    false, true, 3)
) AS m(cat_slug, attr_slug, is_required, is_filterable, sort_order)
JOIN public.categories c ON c.slug = m.cat_slug
JOIN public.attributes a ON a.slug = m.attr_slug
ON CONFLICT (category_id, attribute_id) DO UPDATE
  SET is_required = EXCLUDED.is_required,
      is_filterable = EXCLUDED.is_filterable,
      sort_order = EXCLUDED.sort_order;

-- ── 4) Backfill from the legacy flat columns ───────────────────────────────
-- listings.material / color / brand predate this system. Copy what is already
-- there so existing listings do not look empty, and so the required-attribute
-- check does not retroactively block edits to live listings.
INSERT INTO public.listing_attribute_values (listing_id, attribute_id, option_id)
SELECT l.id, a.id, o.id
FROM public.listings l
JOIN public.attributes a ON a.slug = 'material'
JOIN public.attribute_options o ON o.attribute_id = a.id AND o.value = lower(btrim(l.material))
WHERE l.material IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.category_attribute_set(l.category_id) s WHERE s.attribute_id = a.id)
ON CONFLICT DO NOTHING;

INSERT INTO public.listing_attribute_values (listing_id, attribute_id, option_id)
SELECT l.id, a.id, o.id
FROM public.listings l
JOIN public.attributes a ON a.slug = 'color'
JOIN public.attribute_options o ON o.attribute_id = a.id AND o.value = lower(btrim(l.color))
WHERE l.color IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.category_attribute_set(l.category_id) s WHERE s.attribute_id = a.id)
ON CONFLICT DO NOTHING;

INSERT INTO public.listing_attribute_values (listing_id, attribute_id, option_id)
SELECT l.id, a.id, o.id
FROM public.listings l
JOIN public.attributes a ON a.slug = 'condition'
JOIN public.attribute_options o ON o.attribute_id = a.id AND o.value = lower(btrim(l.condition))
WHERE l.condition IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.category_attribute_set(l.category_id) s WHERE s.attribute_id = a.id)
ON CONFLICT DO NOTHING;

-- Brand is a free-text column upstream; map known brands to options and keep
-- the rest as text under the same attribute is not possible (single_select),
-- so unmatched brands are simply left for the seller to re-pick.
INSERT INTO public.listing_attribute_values (listing_id, attribute_id, option_id)
SELECT l.id, a.id, o.id
FROM public.listings l
JOIN public.attributes a ON a.slug = 'brand'
JOIN public.attribute_options o ON o.attribute_id = a.id AND o.value = lower(btrim(l.brand))
WHERE l.brand IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.category_attribute_set(l.category_id) s WHERE s.attribute_id = a.id)
ON CONFLICT DO NOTHING;
