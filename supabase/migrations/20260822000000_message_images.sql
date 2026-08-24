-- Chat image attachments.
--
-- This column was added to the live database out of band, so no migration in
-- this repo created it — a fresh `supabase db reset` produced a schema without
-- it and every image send failed. Written IF NOT EXISTS so it is a safe no-op
-- against the existing database while still reproducing the live schema from
-- scratch.
--
-- Images are uploaded to Cloudinary via the `cloudinary-sign` edge function, so
-- this stores the returned absolute secure_url rather than a storage path.
alter table public.messages
  add column if not exists image_url text;

comment on column public.messages.image_url is
  'Absolute Cloudinary secure_url for an attached image. Null for text-only messages.';

-- An image-only message carries an empty body, so at least one of the two must
-- be present for the row to mean anything.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_body_or_image'
  ) then
    alter table public.messages
      add constraint messages_body_or_image
      check (coalesce(nullif(btrim(body), ''), image_url) is not null);
  end if;
end $$;
