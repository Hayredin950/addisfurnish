
CREATE POLICY "listing images readable" ON storage.objects FOR SELECT USING (bucket_id = 'listing-images');
CREATE POLICY "users upload own listing images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users update own listing images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users delete own listing images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

INSERT INTO public.listing_images (listing_id, url, position) VALUES
  ('33333333-3333-3333-3333-333333333301','demo/sofa.jpg',0),
  ('33333333-3333-3333-3333-333333333302','demo/dining.jpg',0),
  ('33333333-3333-3333-3333-333333333303','demo/chair.jpg',0),
  ('33333333-3333-3333-3333-333333333304','demo/wardrobe.jpg',0),
  ('33333333-3333-3333-3333-333333333305','demo/coffee.jpg',0),
  ('33333333-3333-3333-3333-333333333306','demo/bed.jpg',0);
