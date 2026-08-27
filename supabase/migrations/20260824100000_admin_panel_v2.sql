-- Admin panel V1 part 2: featured scheduling, report resolution fields,
-- app settings store, cancellation metrics and seller performance RPC.

-- ── Featured listing scheduling (spec §20) ──────────────────────────────────
alter table public.listings add column if not exists featured_until timestamptz;

-- ── Report handling fields (spec §11) ───────────────────────────────────────
alter table public.reports add column if not exists resolution text;
alter table public.reports add column if not exists assigned_admin uuid
  references public.profiles(id) on delete set null;

-- ── Marketplace settings store (spec §22/§23 Settings) ──────────────────────
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "admins read app settings" on public.app_settings
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "admins write app settings" on public.app_settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant all on public.app_settings to service_role;

insert into public.app_settings (key, value) values
  ('moderation.auto_flag_views', 'false'),
  ('moderation.dispute_deadline_hours', '72'),
  ('listings.dead_days', '30'),
  ('listings.dead_min_views', '10'),
  ('notifications.email_enabled', 'true'),
  ('notifications.telegram_enabled', 'true')
on conflict (key) do nothing;

-- ── Health stats v2: adds deal-cancellation metrics (spec §7.4) ─────────────
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
        (select count(*) from public.offers where status = 'cancelled') as deals_cancelled,
        (select count(*) from public.offers where status = 'declined') as deals_declined,
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
      'cancellations', jsonb_build_object(
        'accepted',  (select deals   from funnel),
        'cancelled', (select deals_cancelled from funnel),
        'declined',  (select deals_declined  from funnel),
        'cancel_rate_pct', round(
          (select deals_cancelled from funnel)::float /
          greatest((select deals_cancelled from funnel) + (select deals from funnel), 1) * 100
        )
      ),
      'funnel', (select to_jsonb(f) from funnel f)
    )
  ) end
$$;

-- ── Seller performance (spec §8.4 / §16) — operational view for V1 ──────────
create or replace function public.admin_seller_performance(_limit int default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.has_role(auth.uid(), 'admin') then null
  else (
    select coalesce(jsonb_agg(row order by (row->>'views')::int desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'seller_id', p.id,
        'name', coalesce(p.shop_name, p.full_name),
        'verified', p.verified,
        'suspended', p.banned_until is not null and p.banned_until > now(),
        'listings', (select count(*) from public.listings l where l.seller_id = p.id),
        'views', (select coalesce(sum(l.view_count), 0) from public.listings l where l.seller_id = p.id),
        'inquiries', (
          select count(*) from public.conversations c
          where c.seller_id = p.id
        ),
        'responded', (
          select count(distinct c.id) from public.conversations c
          where c.seller_id = p.id
            and exists (
              select 1 from public.messages m
              where m.conversation_id = c.id and m.sender_id = p.id
            )
        ),
        'avg_response_minutes', (
          select round(avg(extract(epoch from (fr.first_reply - fb.first_buyer)) / 60.0))
          from public.conversations c
          cross join lateral (
            select min(m2.created_at) as first_buyer
            from public.messages m2
            where m2.conversation_id = c.id and m2.sender_id = c.buyer_id
          ) fb
          join lateral (
            select min(m3.created_at) as first_reply
            from public.messages m3
            where m3.conversation_id = c.id
              and m3.sender_id = p.id
              and m3.created_at >= fb.first_buyer
          ) fr on true
          where c.seller_id = p.id and fb.first_buyer is not null and fr.first_reply is not null
        ),
        'sales', (
          select count(*) from public.listings l
          where l.seller_id = p.id and l.status = 'sold'
        ),
        'rating', (
          select round(avg(r.rating)::numeric, 1) from public.reviews r
          where r.seller_id = p.id
        ),
        'reports', (
          select count(*) from public.reports rp where rp.reported_user_id = p.id
        )
      ) as row
      from public.profiles p
      where p.is_seller
      limit _limit
    ) sellers
  ) end
$$;

revoke all on function public.admin_seller_performance(int) from anon;
grant execute on function public.admin_seller_performance(int) to authenticated;
