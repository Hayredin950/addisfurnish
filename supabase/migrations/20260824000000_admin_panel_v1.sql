-- Admin panel V1 (HabeshaHome admin spec §12, §21, §7):
-- 1) disputes — dedicated time-boxed queue for buyer/seller conflicts.
-- 2) admin_audit_log — accountability trail for every sensitive admin action.
-- 3) admin_health_stats() — marketplace-health RPC: sell-through, median days
--    to sale, funnel counts and seller response performance in one call.

-- ── 1) Disputes ──────────────────────────────────────────────────────────────
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending','investigating','resolved','dismissed','escalated')),
  deadline_at timestamptz not null default now() + interval '72 hours',
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists disputes_status_idx on public.disputes (status, created_at desc);
create index if not exists disputes_buyer_idx on public.disputes (buyer_id);
create index if not exists disputes_seller_idx on public.disputes (seller_id);

alter table public.disputes enable row level security;

create policy "parties open dispute" on public.disputes
  for insert to authenticated
  with check (buyer_id = auth.uid() or seller_id = auth.uid());

create policy "parties or admin read dispute" on public.disputes
  for select to authenticated
  using (
    buyer_id = auth.uid() or seller_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
  );

create policy "admin updates dispute" on public.disputes
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant all on public.disputes to service_role;

create trigger disputes_updated before update on public.disputes
  for each row execute function public.update_updated_at_column();

-- ── 2) Admin audit log ───────────────────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists audit_created_idx on public.admin_audit_log (created_at desc);
create index if not exists audit_admin_idx on public.admin_audit_log (admin_user_id);

alter table public.admin_audit_log enable row level security;

create policy "admins read audit log" on public.admin_audit_log
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "admins write audit log" on public.admin_audit_log
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

grant all on public.admin_audit_log to service_role;

-- ── 3) Marketplace health RPC ────────────────────────────────────────────────
-- Sell-through = listings sold in the window ÷ (sold in window + still active),
-- i.e. of everything that could have sold, how much did. Median days to sale
-- uses created→status-change latency as a proxy (no dedicated sold_at column).
create or replace function public.admin_health_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.has_role(auth.uid(), 'admin') then null
  else (
    with sold_win as (
      select
        count(*) filter (where status = 'sold' and updated_at > now() - interval '7 days')  as d7,
        count(*) filter (where status = 'sold' and updated_at > now() - interval '30 days') as d30,
        count(*) filter (where status = 'sold' and updated_at > now() - interval '60 days') as d60
      from public.listings
    ),
    st as (
      select
        d7::float / greatest(d7 + (select count(*) from public.listings where status = 'active'), 1) as d7,
        d30::float / greatest(d30 + (select count(*) from public.listings where status = 'active'), 1) as d30,
        d60::float / greatest(d60 + (select count(*) from public.listings where status = 'active'), 1) as d60
      from sold_win
    ),
    medians as (
      select
        percentile_cont(0.5) within group (
          order by extract(epoch from (updated_at - created_at)) / 86400.0
        ) as days_to_sale
      from public.listings where status = 'sold'
    ),
    conv as (
      select
        c.id,
        c.buyer_id,
        c.seller_id,
        (select min(m.created_at) from public.messages m
          where m.conversation_id = c.id and m.sender_id = c.buyer_id) as first_buyer,
        (select min(m.created_at) from public.messages m
          where m.conversation_id = c.id
            and m.sender_id = c.seller_id
            and m.created_at >= (select min(m2.created_at) from public.messages m2
              where m2.conversation_id = c.id and m2.sender_id = c.buyer_id)
        ) as first_seller
      from public.conversations c
    ),
    response as (
      select
        count(*) filter (where first_seller is not null)::float
          / greatest(count(*), 1) as rate,
        avg(extract(epoch from (first_seller - first_buyer)) / 60.0)
          filter (where first_seller is not null) as avg_min,
        percentile_cont(0.5) within group (
          order by extract(epoch from (first_seller - first_buyer)) / 60.0
        ) filter (where first_seller is not null) as med_min
      from conv
      where first_buyer is not null
    ),
    funnel as (
      select
        (select count(*) from public.listings) as published,
        (select coalesce(sum(view_count), 0) from public.listings) as viewed,
        (select count(*) from public.conversations) as inquiries,
        (select count(*) from conv where first_seller is not null) as responded,
        (select count(*) from public.offers where status = 'accepted') as deals,
        (select count(*) from public.listings where status = 'sold') as sales
    )
    select jsonb_build_object(
      'sell_through', jsonb_build_object(
        'd7',  round((select d7  from st) * 100),
        'd30', round((select d30 from st) * 100),
        'd60', round((select d60 from st) * 100)
      ),
      'median_days_to_sale', round((select days_to_sale from medians)::numeric, 1),
      'seller_response', jsonb_build_object(
        'rate_pct',   round((select rate    from response) * 100),
        'avg_minutes',round((select avg_min from response)::numeric),
        'median_minutes', round((select med_min from response)::numeric)
      ),
      'funnel', (select to_jsonb(f) from funnel f)
    )
  ) end
$$;

revoke all on function public.admin_health_stats() from anon;
grant execute on function public.admin_health_stats() to authenticated;
