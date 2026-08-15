-- Premium bot templates: remember the "connected + join channel" onboarding
-- card's message id so it can be deleted once the user verifies membership —
-- the chat shouldn't keep a dead onboarding UI card around forever.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_pending_message_id bigint;
