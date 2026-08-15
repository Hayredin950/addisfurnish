-- Sellers can attach ONE short showcase video (max ~60s) to a listing so
-- buyers see the item in motion. video_url holds the storage path or full URL
-- of the uploaded file; null means no video. There is deliberately no
-- duration check in the DB — validation happens at upload time in the apps.
alter table public.listings add column if not exists video_url text;
