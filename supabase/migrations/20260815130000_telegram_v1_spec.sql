-- ── Telegram V1 spec foundation ───────────────────────────────────────────
-- Attribution, channel-post lifecycle, webhook idempotency, delivery
-- telemetry, sell-via-bot state, and blocked-bot handling.

-- 1) analytics_events — generic attribution (spec §11.3 / §12). Anyone may
--    record a client-side event; admins read; service role manages.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  listing_id uuid,
  source text,
  medium text,
  campaign text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.analytics_events enable row level security;
create policy "record analytics events" on public.analytics_events
  for insert to anon, authenticated with check (true);
create policy "admins read analytics events" on public.analytics_events
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- 2) telegram_channel_posts — where each listing was posted, so the post can
--    be edited (sold / price drop) or removed when the listing changes.
create table if not exists public.telegram_channel_posts (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  chat_id text not null,
  message_id bigint not null,
  posted_at timestamptz not null default now()
);
alter table public.telegram_channel_posts enable row level security;
create policy "admins read channel posts" on public.telegram_channel_posts
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- 3) telegram_processed_updates — webhook idempotency (Telegram redelivers).
create table if not exists public.telegram_processed_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);
alter table public.telegram_processed_updates enable row level security;
create policy "admins read processed updates" on public.telegram_processed_updates
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- 4) telegram_delivery_log — every send attempt, for the admin health view.
create table if not exists public.telegram_delivery_log (
  id bigint generated always as identity primary key,
  kind text not null,          -- notify | channel_post | channel_edit | channel_delete | webhook
  chat_id text,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
alter table public.telegram_delivery_log enable row level security;
create policy "admins read delivery log" on public.telegram_delivery_log
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- 5) profiles — auto-set when Telegram reports the user blocked the bot.
alter table public.profiles add column if not exists telegram_blocked boolean not null default false;

-- 6) telegram_sell_sessions — sell-via-bot conversation state (per chat).
create table if not exists public.telegram_sell_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id text not null,
  step text not null default 'photos',
  photo_file_ids text[] not null default '{}',
  category_id uuid,
  condition text,
  price numeric,
  city text,
  listing_id uuid references public.listings(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (chat_id)
);
alter table public.telegram_sell_sessions enable row level security;
create policy "owners read own sell session" on public.telegram_sell_sessions
  for select to authenticated using (user_id = auth.uid());

-- 7) per-chat rate limit for notification fan-outs (Telegram ~1 msg/s per chat).
create table if not exists public.telegram_chat_rate (
  chat_id text primary key,
  last_sent_at timestamptz not null default now()
);
alter table public.telegram_chat_rate enable row level security;
create policy "admins read chat rate" on public.telegram_chat_rate
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
