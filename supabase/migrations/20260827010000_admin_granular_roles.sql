-- ── Admin granular roles ──────────────────────────────────────────────────
-- Replaces the coarse "admin = everything" model with the roles matrix shown
-- in the Settings tab (spec SS22):
--
--   Super Admin        → everything (profiles.is_super_admin flag)
--   Moderator (moderator)      → moderation · listings · disputes
--   Verification Admin (verification) → verification
--   Category Manager (category_manager) → categories
--   Analytics Viewer (analytics) → analytics
--
-- `admin` keeps full access so existing admins are not downgraded. Scope is
-- answered by public.admin_scope(_user_id, _scope) which returns true for
-- super admins and for any admin-role holder, plus the specific readers for
-- each scope.
--
-- NOTE: the enum values (moderator exists; verification / category_manager /
-- analytics) are added in the companion migration 20260827010000 so each
-- ADD VALUE commits before this migration references them.

-- ── Scope check ───────────────────────────────────────────────────────────
-- Scopes map 1:1 to admin tab areas so a limited admin only sees / acts
-- within their area. Super admin and plain `admin` pass every scope.
create or replace function public.admin_scope(_user_id uuid, _scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select is_super_admin from public.profiles where id = _user_id), false)
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = _user_id
        and (
          ur.role = 'admin'
          or (ur.role = 'moderator' and _scope in ('moderation', 'listings', 'disputes'))
          or (ur.role = 'verification' and _scope = 'verification')
          or (ur.role = 'category_manager' and _scope = 'categories')
          or (ur.role = 'analytics' and _scope = 'analytics')
        )
    )
$$;

revoke all on function public.admin_scope(uuid, text) from public, anon;
grant execute on function public.admin_scope(uuid, text) to authenticated;

-- ── Categories: category managers (plus admins) may manage ────────────────
drop policy if exists "admins manage categories" on public.categories;
create policy "admins manage categories" on public.categories
  for all to authenticated
  using (public.admin_scope(auth.uid(), 'categories'))
  with check (public.admin_scope(auth.uid(), 'categories'));

-- ── Listings: moderators (plus admins) may edit / delete any listing ───────
drop policy if exists "sellers update own listings" on public.listings;
create policy "sellers update own listings" on public.listings
  for update to authenticated
  using (seller_id = auth.uid() or public.admin_scope(auth.uid(), 'listings'))
  with check (seller_id = auth.uid() or public.admin_scope(auth.uid(), 'listings'));

drop policy if exists "sellers delete own listings" on public.listings;
create policy "sellers delete own listings" on public.listings
  for delete to authenticated
  using (seller_id = auth.uid() or public.admin_scope(auth.uid(), 'listings'));

-- ── Disputes (moderation + admins) ────────────────────────────────────────
drop policy if exists "parties or admin read dispute" on public.disputes;
create policy "parties or admin read dispute" on public.disputes
  for select to authenticated
  using (
    buyer_id = auth.uid() or seller_id = auth.uid()
    or public.admin_scope(auth.uid(), 'disputes')
  );

drop policy if exists "admin updates dispute" on public.disputes;
create policy "admin updates dispute" on public.disputes
  for update to authenticated
  using (public.admin_scope(auth.uid(), 'disputes'))
  with check (public.admin_scope(auth.uid(), 'disputes'));

-- ── Reports (moderation + admins see flagged content) ─────────────────────
drop policy if exists "reporter or admin read report" on public.reports;
create policy "reporter or admin read report" on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.admin_scope(auth.uid(), 'moderation'));

drop policy if exists "admin updates report" on public.reports;
create policy "admin updates report" on public.reports
  for update to authenticated
  using (public.admin_scope(auth.uid(), 'moderation'))
  with check (public.admin_scope(auth.uid(), 'moderation'));

-- ── Other admin tables stay admin-scope for now (settings, audit, telegram
--    need full admin / super admin access).

-- ── Conversation / message read for scrutiny (moderation, disputes) ───────
drop policy if exists "admins read all conversations" on public.conversations;
create policy "admins read all conversations" on public.conversations
  for select to authenticated
  using (public.admin_scope(auth.uid(), 'moderation'));

drop policy if exists "admins read all messages" on public.messages;
create policy "admins read all messages" on public.messages
  for select to authenticated
  using (public.admin_scope(auth.uid(), 'moderation'));

-- ── Verification (verification admins + admins) ───────────────────────────
drop policy if exists "seller reads own documents" on public.seller_verification_documents;
create policy "seller reads own documents" on public.seller_verification_documents
  for select to authenticated
  using (seller_id = auth.uid() or public.admin_scope(auth.uid(), 'verification'));

drop policy if exists "admin updates documents" on public.seller_verification_documents;
create policy "admin updates documents" on public.seller_verification_documents
  for update to authenticated
  using (public.admin_scope(auth.uid(), 'verification'))
  with check (public.admin_scope(auth.uid(), 'verification'));

drop policy if exists "admin reads decisions" on public.verification_decisions;
create policy "admin reads decisions" on public.verification_decisions
  for select to authenticated
  using (public.admin_scope(auth.uid(), 'verification'));

drop policy if exists "admin records decisions" on public.verification_decisions;
create policy "admin records decisions" on public.verification_decisions
  for insert to authenticated
  with check (public.admin_scope(auth.uid(), 'verification'));

drop policy if exists "verif docs admin read" on storage.objects;
create policy "verif docs admin read" on storage.objects
  for select using (bucket_id = 'verification-docs' and public.admin_scope(auth.uid(), 'verification'));

create or replace function public.admin_notify_user(_user_id uuid, _type text, _payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _user_id is null or not public.admin_scope(auth.uid(), 'verification') then return; end if;
  insert into public.notifications (user_id, type, payload)
  values (_user_id, _type, coalesce(_payload, '{}'::jsonb));
end;
$$;
revoke all on function public.admin_notify_user(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_notify_user(uuid, text, jsonb) to authenticated;

-- ── Analytics (analytics viewers + admins) ────────────────────────────────
drop policy if exists "admins read all listing views" on public.listing_views;
create policy "admins read all listing views" on public.listing_views
  for select to authenticated
  using (public.admin_scope(auth.uid(), 'analytics'));

create or replace function public.admin_health_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.admin_scope(auth.uid(), 'analytics') then null
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
grant execute on function public.admin_health_stats() to authenticated;

create or replace function public.admin_seller_performance(_limit int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.admin_scope(auth.uid(), 'analytics') then null
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

-- ── Role grants: store which role on the request row ──────────────────────
alter table public.admin_role_requests
  add column if not exists role_name text;

-- The action check constraint only allowed promote/demote; extend it so the
-- role-aware flow can record grant/revoke. Drop + recreate because there is
-- no ALTER-friendly safe "add to check" without a table rewrite in PG.
alter table public.admin_role_requests
  drop constraint if exists admin_role_requests_action_check;
alter table public.admin_role_requests
  add constraint admin_role_requests_action_check
  check (action in ('promote','demote','grant','revoke'));

-- ── Role-aware request/confirm ───────────────────────────────────────────
-- Only super admins grant / revoke admin roles (the same rule the previous
-- flow used). The acting user is taken from auth.uid() inside the function
-- rather than trusting a client-supplied id. _action ∈ grant | revoke.
create or replace function public.admin_request_role_change(
  _target_user_id uuid,
  _role text,
  _action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  _requester uuid := auth.uid();
  _code text;
  _requester_email text;
  _target_name text;
  _subject text;
  _html text;
  _valid_roles constant text[] := array['admin','moderator','verification','category_manager','analytics'];
begin
  if _requester is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  -- Only a super admin manages roles.
  if not coalesce((select is_super_admin from public.profiles where id = _requester), false) then
    return jsonb_build_object('ok', false, 'error', 'admin');
  end if;
  if _action not in ('grant','revoke') then
    return jsonb_build_object('ok', false, 'error', 'action');
  end if;
  if _role is null or not (_role = any(_valid_roles)) then
    return jsonb_build_object('ok', false, 'error', 'role');
  end if;
  if _target_user_id is null or _target_user_id = _requester then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  select full_name into _target_name from public.profiles where id = _target_user_id;
  if _target_name is null then
    return jsonb_build_object('ok', false, 'error', 'target');
  end if;

  -- Super admins may never be demoted / have roles stripped.
  if coalesce((select is_super_admin from public.profiles where id = _target_user_id), false)
     and _action = 'revoke' then
    return jsonb_build_object('ok', false, 'error', 'super_admin');
  end if;

  if _action = 'grant' then
    if public.has_role(_target_user_id, _role::public.app_role) then
      return jsonb_build_object('ok', false, 'error', 'already_role');
    end if;
  else
    if not public.has_role(_target_user_id, _role::public.app_role) then
      return jsonb_build_object('ok', false, 'error', 'no_role');
    end if;
  end if;

  select email into _requester_email from auth.users where id = _requester;
  if _requester_email is null then
    return jsonb_build_object('ok', false, 'error', 'no_email');
  end if;

  _code := lpad(floor(random() * 1000000)::text, 6, '0');

  update public.admin_role_requests
    set used_at = now()
    where target_user_id = _target_user_id
      and role_name = _role
      and action = _action
      and used_at is null;

  insert into public.admin_role_requests (requester_id, target_user_id, action, role_name, token, code, expires_at)
  values (_requester, _target_user_id, _action, _role, _code, _code, now() + interval '10 minutes');

  if _action = 'grant' then
    _subject := 'AddisHome admin confirmation code';
    _html :=
      '<h2>Admin confirmation code</h2>' ||
      '<p>You requested to grant <b>' || _target_name || '</b> the <b>' || _role || '</b> role.</p>' ||
      '<p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:24px 0;">' || _code || '</p>' ||
      '<p>This code expires in 10 minutes.</p>' ||
      '<p>If you did not request this, ignore this email.</p>';
  else
    _subject := 'AddisHome admin role removal code';
    _html :=
      '<h2>Admin role removal code</h2>' ||
      '<p>You requested to revoke <b>' || _target_name || '</b>''s <b>' || _role || '</b> role.</p>' ||
      '<p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:24px 0;">' || _code || '</p>' ||
      '<p>This code expires in 10 minutes.</p>' ||
      '<p>If you did not request this, ignore this email.</p>';
  end if;

  begin
    perform http_post(
      url := (select vault.decrypt_secret('SUPABASE_URL')) || '/functions/v1/send-mail',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select vault.decrypt_secret('SUPABASE_SERVICE_ROLE_KEY'))
      ),
      body := jsonb_build_object(
        'to', _requester_email,
        'subject', _subject,
        'html', _html
      ),
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning 'admin_request_role_change email failed: % (%)', SQLERRM, SQLSTATE;
  end;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_request_role_change(uuid, text, text) from public, anon;
grant execute on function public.admin_request_role_change(uuid, text, text) to authenticated;

-- Confirm with the emailed 6-digit code. Applies whatever role the recorded
-- request refers to, so the signed-in top admin is the only actor and the
-- caller does not need to pass the role again.
create or replace function public.admin_confirm_role_change(_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  _req public.admin_role_requests%ROWTYPE;
  _target_name text;
  _target_email text;
  _subject text;
  _html text;
begin
  if _code is null or length(_code) != 6 then
    return jsonb_build_object('ok', false, 'error', 'code');
  end if;

  select * into _req from public.admin_role_requests
    where code = _code and used_at is null
    order by created_at desc limit 1;

  if _req.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if _req.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  -- The acting super admin must still be one (defense in depth).
  if not coalesce((select is_super_admin from public.profiles where id = _req.requester_id), false) then
    return jsonb_build_object('ok', false, 'error', 'admin');
  end if;

  -- Super admins can never be downgraded.
  if _req.action = 'revoke' and coalesce(
    (select is_super_admin from public.profiles where id = _req.target_user_id), false
  ) then
    return jsonb_build_object('ok', false, 'error', 'super_admin');
  end if;

  if _req.action = 'grant' then
    insert into public.user_roles (user_id, role)
    values (_req.target_user_id, _req.role_name::public.app_role)
    on conflict do nothing;
  else
    delete from public.user_roles
    where user_id = _req.target_user_id and role = _req.role_name::public.app_role;
  end if;

  update public.admin_role_requests set used_at = now() where id = _req.id;

  select full_name into _target_name from public.profiles where id = _req.target_user_id;
  select email into _target_email from auth.users where id = _req.target_user_id;

  if _req.action = 'grant' then
    _subject := 'You''re now a ' || _req.role_name || ' on AddisHome';
    _html :=
      '<h2>New admin role 🎉</h2>' ||
      '<p>Hi <b>' || coalesce(_target_name, 'there') || '</b>,</p>' ||
      '<p>You''ve been granted the <b>' || _req.role_name || '</b> role on AddisHome.</p>' ||
      '<p><a href="https://addisfurnish.vercel.app/admin">Open the admin dashboard</a></p>';
  else
    _subject := 'Your ' || _req.role_name || ' role on AddisHome was removed';
    _html :=
      '<h2>Admin role removed</h2>' ||
      '<p>Hi <b>' || coalesce(_target_name, 'there') || '</b>,</p>' ||
      '<p>Your <b>' || _req.role_name || '</b> role on AddisHome has been removed. You can still use the marketplace as normal.</p>';
  end if;

  if _target_email is not null then
    begin
      perform http_post(
        url := (select vault.decrypt_secret('SUPABASE_URL')) || '/functions/v1/send-mail',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select vault.decrypt_secret('SUPABASE_SERVICE_ROLE_KEY'))
        ),
        body := jsonb_build_object(
          'to', _target_email,
          'subject', _subject,
          'html', _html
        ),
        timeout_milliseconds := 10000
      );
    exception when others then
      raise warning 'admin_confirm_role_change email failed: % (%)', SQLERRM, SQLSTATE;
    end;
  end if;

  return jsonb_build_object('ok', true, 'action', _req.action, 'role', _req.role_name, 'name', _target_name);
end;
$$;

revoke all on function public.admin_confirm_role_change(text) from public;
grant execute on function public.admin_confirm_role_change(text) to anon, authenticated;
