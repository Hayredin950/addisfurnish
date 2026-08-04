-- Chat message editing, soft deletion and read receipts; notification dismissal.
--
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1. Message edit / soft-delete / read-receipt columns.
--
-- Deleting keeps the row and stamps deleted_at so the other side sees a
-- "this message was deleted" placeholder instead of history silently changing.
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at    timestamptz;

COMMENT ON COLUMN public.messages.edited_at  IS 'Set when the sender edits the body.';
COMMENT ON COLUMN public.messages.deleted_at IS 'Soft delete; body is hidden but the row remains.';
COMMENT ON COLUMN public.messages.read_at    IS 'Set when the recipient first opens the conversation.';

-- Unread lookups per conversation.
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON public.messages (conversation_id, sender_id)
  WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Grants and policies for UPDATE / DELETE on messages.
--
-- Only SELECT and INSERT were granted, so editing was impossible at the
-- privilege level regardless of policy. UPDATE is open to both participants
-- because the *recipient* is the one who sets read_at; a trigger (step 3)
-- enforces which columns each side may actually touch.
-- ---------------------------------------------------------------------------
GRANT UPDATE, DELETE ON public.messages TO authenticated;

DROP POLICY IF EXISTS "participants update messages" ON public.messages;
CREATE POLICY "participants update messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
              AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
              AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid()))
  );

-- Hard delete stays sender-only (the UI soft-deletes, but keep this correct).
DROP POLICY IF EXISTS "sender deletes messages" ON public.messages;
CREATE POLICY "sender deletes messages" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Column-level guard.
--
-- The UPDATE policy above lets either participant update the row, which alone
-- would let a recipient rewrite the sender's words. Enforce per-column rules:
-- only the sender may change body/edited_at/deleted_at, and only the recipient
-- may set read_at.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_message_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- service_role / SECURITY DEFINER callers have no auth.uid(); let them pass.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.body IS DISTINCT FROM OLD.body
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.edited_at IS DISTINCT FROM OLD.edited_at)
     AND OLD.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'only the sender can edit or delete a message';
  END IF;

  IF NEW.read_at IS DISTINCT FROM OLD.read_at
     AND OLD.sender_id = auth.uid() THEN
    RAISE EXCEPTION 'the sender cannot mark their own message as read';
  END IF;

  -- Immutable regardless of who asks.
  NEW.id := OLD.id;
  NEW.conversation_id := OLD.conversation_id;
  NEW.sender_id := OLD.sender_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_message_update_trg ON public.messages;
CREATE TRIGGER enforce_message_update_trg
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_update();

-- ---------------------------------------------------------------------------
-- 4. Keep conversations.last_message_at accurate.
--
-- It only ever had its DEFAULT now(), so the inbox was ordered by conversation
-- creation time rather than latest activity.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = NEW.created_at
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS touch_conversation_trg ON public.messages;
CREATE TRIGGER touch_conversation_trg
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();

-- Backfill from existing messages.
UPDATE public.conversations c
   SET last_message_at = m.latest
  FROM (SELECT conversation_id, MAX(created_at) AS latest
          FROM public.messages GROUP BY conversation_id) m
 WHERE m.conversation_id = c.id
   AND c.last_message_at < m.latest;

-- ---------------------------------------------------------------------------
-- 5. Let users dismiss their own notifications.
--
-- Only SELECT and UPDATE were granted, so there was no way to remove one.
-- ---------------------------------------------------------------------------
GRANT DELETE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "own notifications delete" ON public.notifications;
CREATE POLICY "own notifications delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Realtime needs full row images so UPDATE events (edits, deletions and
--    read receipts) carry enough context for clients to reconcile.
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages REPLICA IDENTITY FULL;
