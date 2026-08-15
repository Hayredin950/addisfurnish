-- 20260815010000_review_and_channel.sql
--
-- Two additions:
--
-- 1. notify_shop_reviewed: when a new review lands, notify the seller (in-app
--    centre + push + Telegram via the existing notification triggers). Reviews
--    are written straight into the reviews table by the client, so a trigger is
--    the only place that can fan out reliably. It runs SECURITY DEFINER, which
--    is what lets it insert a notification for the seller without the caller
--    sharing a conversation with them (the notify_user RPC guard would block it).
--
-- 2. profiles.telegram_channel_joined_at: records that a linked Telegram chat
--    proved it joined the marketing channel (telegram-bot /verify callback).
--    telegram-notify gates alert delivery on this column when a channel is
--    configured. Existing linked chats are backfilled to their link time so
--    nobody loses alerts overnight; only NEW links must verify.

-- ── 1. Review → seller notification ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_shop_reviewed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _shop_slug text;
BEGIN
  -- People reviewing their own shop get no ping.
  IF NEW.author_id = NEW.seller_id THEN RETURN NEW; END IF;
  SELECT p.shop_slug INTO _shop_slug FROM public.profiles p WHERE p.id = NEW.seller_id;
  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (NEW.seller_id, 'shop_reviewed',
          jsonb_build_object('title', NEW.comment, 'rating', NEW.rating,
                             'shopSlug', _shop_slug, 'shopId', NEW.seller_id));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS shop_reviewed_notify ON public.reviews;
CREATE TRIGGER shop_reviewed_notify AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_shop_reviewed();

-- ── 2. Telegram channel-join gating ───────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_channel_joined_at timestamptz;

-- Existing linked chats keep working; only future links must verify the join.
UPDATE public.profiles
   SET telegram_channel_joined_at = COALESCE(telegram_channel_joined_at, telegram_linked_at)
 WHERE telegram_chat_id IS NOT NULL;
