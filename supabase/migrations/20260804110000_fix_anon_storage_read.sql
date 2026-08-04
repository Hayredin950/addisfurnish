-- Fix: anonymous visitors could not load any listing image.
--
-- Signing a URL makes Postgres evaluate every SELECT policy on
-- storage.objects. One of them — "verif docs admin read" — calls
-- public.has_role(), which is REVOKEd from anon (20260802081500), so the whole
-- statement failed with:
--
--   permission denied for function has_role
--
-- Net effect: logged-out buyers saw placeholder icons instead of photos.
--
-- Scoping the admin/owner policies to `authenticated` means anon never
-- evaluates them, so the public-read policy alone applies.
--
-- Safe to re-run.

DROP POLICY IF EXISTS "verif docs admin read" ON storage.objects;
CREATE POLICY "verif docs admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "verif docs owner read" ON storage.objects;
CREATE POLICY "verif docs owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND owner = auth.uid());

-- Listing images are public: keep the read policy open to both roles, but state
-- the bucket explicitly so it can never match the private bucket.
DROP POLICY IF EXISTS "listing images readable" ON storage.objects;
CREATE POLICY "listing images readable" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'listing-images');
