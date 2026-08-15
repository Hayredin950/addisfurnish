-- Per-side conversation deletion.
--
-- A participant can hide a conversation from their own inbox without deleting
-- it for the other person (the counterpart's history is theirs). Each side
-- gets its own timestamp; when BOTH are set the row could be garbage-collected,
-- but keeping it is harmless and avoids destroying the other side's evidence.
--
-- Safe to re-run: every statement is idempotent.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS buyer_deleted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS seller_deleted_at timestamptz;

COMMENT ON COLUMN public.conversations.buyer_deleted_at  IS 'Set when the buyer hides the conversation from their inbox.';
COMMENT ON COLUMN public.conversations.seller_deleted_at IS 'Set when the seller hides the conversation from their inbox.';

CREATE INDEX IF NOT EXISTS conversations_participant_deleted_idx
  ON public.conversations (buyer_id, buyer_deleted_at)
  WHERE buyer_deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversations_seller_deleted_idx
  ON public.conversations (seller_id, seller_deleted_at)
  WHERE seller_deleted_at IS NOT NULL;
