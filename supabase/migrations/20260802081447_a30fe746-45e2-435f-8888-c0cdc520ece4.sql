
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT 'New user',
  phone text,
  city text,
  avatar_url text,
  is_seller boolean NOT NULL DEFAULT false,
  shop_name text,
  shop_slug text UNIQUE,
  shop_description text,
  shop_logo_url text,
  shop_address text,
  verified boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles public read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1), 'New user'), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  parent_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  icon text,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories public read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- LISTINGS
CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  original_price numeric(12,2),
  negotiable boolean NOT NULL DEFAULT true,
  condition text NOT NULL DEFAULT 'good',
  material text,
  color text,
  room_type text,
  brand text,
  city text NOT NULL DEFAULT 'Addis Ababa',
  sub_city text,
  status text NOT NULL DEFAULT 'active',
  view_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_status_created_idx ON public.listings (status, created_at DESC);
CREATE INDEX listings_category_idx ON public.listings (category_id);
GRANT SELECT ON public.listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings public read" ON public.listings FOR SELECT USING (status <> 'draft' OR seller_id = auth.uid());
CREATE POLICY "sellers insert own listings" ON public.listings FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());
CREATE POLICY "sellers update own listings" ON public.listings FOR UPDATE TO authenticated USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sellers delete own listings" ON public.listings FOR DELETE TO authenticated USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER listings_updated BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  url text NOT NULL,
  position int NOT NULL DEFAULT 0
);
CREATE INDEX listing_images_listing_idx ON public.listing_images (listing_id);
GRANT SELECT ON public.listing_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_images TO authenticated;
GRANT ALL ON public.listing_images TO service_role;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "images public read" ON public.listing_images FOR SELECT USING (true);
CREATE POLICY "owner manages images" ON public.listing_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid()));

-- PRICE HISTORY
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  price numeric(12,2) NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.price_history TO anon, authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price history public read" ON public.price_history FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.track_price_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO public.price_history (listing_id, price) VALUES (NEW.id, NEW.price);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER listings_price_history AFTER INSERT OR UPDATE OF price ON public.listings FOR EACH ROW EXECUTE FUNCTION public.track_price_change();

-- FAVORITES
CREATE TABLE public.favorites (
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favorites" ON public.favorites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- CONVERSATIONS + MESSAGES
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read conversations" ON public.conversations FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid());
CREATE POLICY "buyer starts conversation" ON public.conversations FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "participants update conversation" ON public.conversations FOR UPDATE TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid()) WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, created_at);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read messages" ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())));
CREATE POLICY "participants send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())));
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- CALLBACK REQUESTS
CREATE TABLE public.callback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  phone text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.callback_requests TO authenticated;
GRANT ALL ON public.callback_requests TO service_role;
ALTER TABLE public.callback_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read callbacks" ON public.callback_requests FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid());
CREATE POLICY "buyer creates callback" ON public.callback_requests FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "seller updates callback" ON public.callback_requests FOR UPDATE TO authenticated USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());

-- REVIEWS
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, author_id)
);
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews public read" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "own review write" ON public.reviews FOR ALL TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

-- VIEW COUNTER
CREATE OR REPLACE FUNCTION public.increment_listing_views(_listing_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.listings SET view_count = view_count + 1 WHERE id = _listing_id;
$$;
GRANT EXECUTE ON FUNCTION public.increment_listing_views(uuid) TO anon, authenticated;

-- SEED CATEGORIES
INSERT INTO public.categories (id, name, slug, parent_id, icon, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111101','Living Room','living-room',NULL,'sofa',1),
  ('11111111-1111-1111-1111-111111111102','Bedroom','bedroom',NULL,'bed',2),
  ('11111111-1111-1111-1111-111111111103','Office','office',NULL,'briefcase',3),
  ('11111111-1111-1111-1111-111111111104','Kitchen & Dining','kitchen-dining',NULL,'utensils',4),
  ('11111111-1111-1111-1111-111111111105','Outdoor','outdoor',NULL,'trees',5),
  ('11111111-1111-1111-1111-111111111106','Storage','storage',NULL,'archive',6);
INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('Sofas','sofas','11111111-1111-1111-1111-111111111101',1),
  ('Coffee Tables','coffee-tables','11111111-1111-1111-1111-111111111101',2),
  ('TV Stands','tv-stands','11111111-1111-1111-1111-111111111101',3),
  ('Beds','beds','11111111-1111-1111-1111-111111111102',1),
  ('Wardrobes','wardrobes','11111111-1111-1111-1111-111111111102',2),
  ('Desks','desks','11111111-1111-1111-1111-111111111103',1),
  ('Office Chairs','office-chairs','11111111-1111-1111-1111-111111111103',2),
  ('Dining Sets','dining-sets','11111111-1111-1111-1111-111111111104',1),
  ('Garden Chairs','garden-chairs','11111111-1111-1111-1111-111111111105',1),
  ('Shelves','shelves','11111111-1111-1111-1111-111111111106',1);

-- DEMO SELLERS + LISTINGS
INSERT INTO public.profiles (id, full_name, phone, city, is_seller, shop_name, shop_slug, shop_description, shop_address, verified) VALUES
  ('22222222-2222-2222-2222-222222222201','Selam Bekele','+251911223344','Addis Ababa',true,'Selam Home Furniture','selam-home','Quality pre-owned furniture from homes and offices around Bole.','Bole, Addis Ababa',true),
  ('22222222-2222-2222-2222-222222222202','Dawit Tesfaye','+251912334455','Addis Ababa',true,'Piassa Second Hand','piassa-second-hand','Family-run shop specialising in solid wood pieces.','Piassa, Addis Ababa',false);

INSERT INTO public.listings (id, seller_id, category_id, title, description, price, original_price, negotiable, condition, material, color, room_type, brand, city, sub_city, status, view_count) VALUES
  ('33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201',(SELECT id FROM public.categories WHERE slug='sofas'),'3-Seater Fabric Sofa — Charcoal','Comfortable 3-seater sofa, used for two years in a smoke-free home. Minor wear on one armrest, cushions are firm.',18500,24000,true,'good','fabric','Charcoal','Living Room','Local','Addis Ababa','Bole','active',124),
  ('33333333-3333-3333-3333-333333333302','22222222-2222-2222-2222-222222222202',(SELECT id FROM public.categories WHERE slug='dining-sets'),'Solid Wood Dining Set (6 Chairs)','Zigba wood dining table with six matching chairs. Table surface refinished last year.',32000,NULL,true,'like new','wood','Walnut','Kitchen','Handmade','Addis Ababa','Piassa','active',86),
  ('33333333-3333-3333-3333-333333333303','22222222-2222-2222-2222-222222222201',(SELECT id FROM public.categories WHERE slug='office-chairs'),'Ergonomic Mesh Office Chair','Adjustable height and lumbar support. Gas lift works perfectly.',4500,6000,false,'good','mesh','Black','Office','Ergo','Addis Ababa','Kazanchis','active',203),
  ('33333333-3333-3333-3333-333333333304','22222222-2222-2222-2222-222222222202',(SELECT id FROM public.categories WHERE slug='wardrobes'),'Two-Door Wardrobe with Mirror','Spacious wardrobe with hanging rail, three shelves and a full-length mirror.',12500,NULL,true,'fair','wood','Beige','Bedroom',NULL,'Addis Ababa','Gerji','active',57),
  ('33333333-3333-3333-3333-333333333305','22222222-2222-2222-2222-222222222201',(SELECT id FROM public.categories WHERE slug='coffee-tables'),'Glass Top Coffee Table','Tempered glass top with metal frame. No chips or scratches.',5200,7000,true,'like new','glass','Clear','Living Room',NULL,'Addis Ababa','Sarbet','active',41),
  ('33333333-3333-3333-3333-333333333306','22222222-2222-2222-2222-222222222202',(SELECT id FROM public.categories WHERE slug='beds')::uuid,'Queen Bed Frame with Headboard','Sturdy queen size frame, mattress not included. Easy to disassemble for transport.',9800,NULL,true,'good','wood','Brown','Bedroom',NULL,'Addis Ababa','Megenagna','active',73);
