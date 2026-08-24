-- Prune listing_images rows whose URL can never render.
--
-- Telegram's photo sends were failing with `wrong type of the web page content`
-- and `failed to get HTTP URL content` (19 of the 50 failures measured over a
-- 7-day window). The cause is data, not code: `listing_images.url` holds three
-- different shapes — bare storage paths, absolute Cloudinary URLs, and one
-- `picsum.photos` placeholder. `resolvePhotoUrl` in the telegram-notify
-- function maps a bare path onto the public bucket, so a path with no object
-- behind it resolves to a 404 HTML page. Telegram fetches the HTML, sees it
-- isn't an image, and rejects the send.
--
-- Two classes are unreachable by construction:
--
--   1. The demo seed rows from 20260802081623 (`demo/sofa.jpg` and friends).
--      No such objects were ever uploaded to the bucket.
--   2. `picsum.photos` placeholders — a random-image service, not a listing
--      photo, and it redirects, which Telegram will not follow for sendPhoto.
--
-- Rows are deleted rather than nulled: `url` is the whole point of the row, and
-- a listing with no images falls back to the placeholder card the UI already
-- renders. Cloudinary URLs and real bucket paths are left untouched.

-- Guard against deleting a demo path that *does* have an object behind it (for
-- instance if someone later uploaded `demo/sofa.jpg` by hand). storage.objects
-- stores the path without the bucket prefix, which is exactly the shape held in
-- `listing_images.url` for these rows.
DELETE FROM public.listing_images li
WHERE li.url LIKE 'demo/%'
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'listing-images'
      AND o.name = li.url
  );

DELETE FROM public.listing_images
WHERE url ILIKE '%picsum.photos%';
