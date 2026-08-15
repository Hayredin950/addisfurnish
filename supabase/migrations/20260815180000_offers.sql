-- Buyer offers on listings.
--
-- A buyer proposes an amount (and optionally a message) on a listing. The
-- seller sees every pending offer on the dashboard and can accept or decline
-- it; the buyer is notified either way (in-app, push and Telegram ride the
-- same notification triggers as everything else).
--
-- The offer row doubles as the "thread" that lets notify_user() deliver the
-- seller alert: that RPC only notifies someone you share a conversation,
-- callback or offer thread with, so the insert must happen before the
-- notify_user() call (same pattern as callback_requests).

CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX offers_seller_idx ON public.offers (seller_id, created_at DESC);
CREATE INDEX offers_listing_idx ON public.offers (listing_id);
CREATE INDEX offers_buyer_idx ON public.offers (buyer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- Participants only — a buyer can see their own offers, a seller theirs.
CREATE POLICY "participants read offers" ON public.offers FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- The buyer owns the creation (the seller_id is the listing's owner).
CREATE POLICY "buyer creates offer" ON public.offers FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());

-- The seller decides the outcome (accept / decline).
CREATE POLICY "seller updates offer" ON public.offers FOR UPDATE TO authenticated
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());

-- The buyer can only cancel their own still-pending offer.
CREATE POLICY "buyer cancels own offer" ON public.offers FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid()) WITH CHECK (buyer_id = auth.uid() AND status = 'cancelled');

-- notify_user: an offer thread is as valid a reason to notify as a
-- conversation or callback thread — without it the seller-alert insert after
-- makeOffer() would be silently dropped.
CREATE OR REPLACE FUNCTION public.notify_user(_user_id uuid, _type text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _user_id IS NULL OR _caller IS NULL THEN RETURN; END IF;
  IF _caller <> _user_id AND NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.buyer_id = _caller AND c.seller_id = _user_id)
       OR (c.seller_id = _caller AND c.buyer_id = _user_id)
    UNION
    SELECT 1 FROM public.callback_requests cb
    WHERE (cb.buyer_id = _caller AND cb.seller_id = _user_id)
       OR (cb.seller_id = _caller AND cb.buyer_id = _user_id)
    UNION
    SELECT 1 FROM public.offers o
    WHERE (o.buyer_id = _caller AND o.seller_id = _user_id)
       OR (o.seller_id = _caller AND o.buyer_id = _user_id)
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (_user_id, _type, COALESCE(_payload, '{}'::jsonb));
END; $$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb) TO authenticated;
