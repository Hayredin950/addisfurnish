-- Fix brand name in admin promotion RPCs (AddisFurnish → AddisHome)
-- These functions were deployed earlier with the old brand name.

CREATE OR REPLACE FUNCTION public.admin_request_role_change(
  _target_user_id uuid,
  _action text,
  _acting_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  _is_super boolean;
  _target_name text;
  _code text;
  _link text;
  _subject text;
  _body text;
  _now timestamptz := now();
BEGIN
  SELECT is_super_admin INTO _is_super FROM profiles WHERE id = _acting_user_id;
  IF NOT COALESCE(_is_super, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  IF _target_user_id = _acting_user_id AND _action = 'demote' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_demote');
  END IF;

  SELECT full_name || ' (' || COALESCE(shop_name, 'user') || ')' INTO _target_name
  FROM profiles WHERE id = _target_user_id;
  IF _target_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Invalidate any existing pending requests for this target
  UPDATE admin_role_requests SET used = true
  WHERE target_user_id = _target_user_id AND used = false AND expires_at > _now;

  _code := lpad(floor(random() * 1000000)::int::text, 6, '0');

  INSERT INTO admin_role_requests (target_user_id, action, code, requested_by, expires_at)
  VALUES (_target_user_id, _action, _code, _acting_user_id, _now + interval '24 hours');

  IF _action = 'promote' THEN
    _subject := 'Confirm: make ' || _target_name || ' an admin on AddisHome';
    _body :=
      '<p>You requested to make <b>' || _target_name || '</b> an admin on AddisHome.</p>' ||
      '<p>Your confirmation code: <b>' || _code || '</b></p>' ||
      '<p>This code expires in 24 hours. If you did not request this, ignore this email.</p>';
  ELSE
    _subject := 'Confirm: remove ' || _target_name || '''s admin access on AddisHome';
    _body :=
      '<p>You requested to remove <b>' || _target_name || '</b>''s admin access on AddisHome.</p>' ||
      '<p>Your confirmation code: <b>' || _code || '</b></p>' ||
      '<p>This code expires in 24 hours. If you did not request this, ignore this email.</p>';
  END IF;

  -- Send email via Supabase Edge Function
  PERFORM net.http_post(
    url := (SELECT vault.decrypt_secret('SUPABASE_URL')) || '/functions/v1/send-mail',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT vault.decrypt_secret('SUPABASE_SERVICE_ROLE_KEY'))
    ),
    body := jsonb_build_object(
      'to', (SELECT email FROM auth.users WHERE id = _acting_user_id),
      'subject', _subject,
      'html', _body
    )
  );

  RETURN jsonb_build_object('ok', true, 'expires_at', (_now + interval '24 hours')::text);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'admin_request_role_change: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'internal');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_role_change(
  _target_user_id uuid,
  _action text,
  _code text,
  _acting_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  _request record;
  _target_name text;
  _subject text;
  _body text;
  _now timestamptz := now();
BEGIN
  SELECT * INTO _request
  FROM admin_role_requests
  WHERE target_user_id = _target_user_id
    AND action = _action
    AND code = _code
    AND used = false
    AND expires_at > _now
  ORDER BY created_at DESC
  LIMIT 1;

  IF _request IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF _request.requested_by != _acting_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_user');
  END IF;

  -- Mark the request as used
  UPDATE admin_role_requests SET used = true WHERE id = _request.id;

  IF _action = 'promote' THEN
    INSERT INTO user_roles (user_id, role) VALUES (_target_user_id, 'admin')
    ON CONFLICT DO NOTHING;

    SELECT full_name || ' (' || COALESCE(shop_name, 'user') || ')' INTO _target_name
    FROM profiles WHERE id = _target_user_id;

    _subject := 'You''re now an admin on AddisHome 🎉';
    _body :=
      '<p>You''ve been promoted to admin on AddisHome. You can now moderate reports, ' ||
      'manage users, and review listings.</p>' ||
      '<p><a href="https://addisfurnish.vercel.app/admin">Open the admin dashboard</a></p>';

    PERFORM net.http_post(
      url := (SELECT vault.decrypt_secret('SUPABASE_URL')) || '/functions/v1/send-mail',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT vault.decrypt_secret('SUPABASE_SERVICE_ROLE_KEY'))
      ),
      body := jsonb_build_object(
        'to', (SELECT email FROM auth.users WHERE id = _target_user_id),
        'subject', _subject,
        'html', _body
      )
    );
  ELSE
    DELETE FROM user_roles WHERE user_id = _target_user_id AND role = 'admin';

    SELECT full_name || ' (' || COALESCE(shop_name, 'user') || ')' INTO _target_name
    FROM profiles WHERE id = _target_user_id;

    _subject := 'Your admin access on AddisHome was removed';
    _body :=
      '<p>Your admin access on AddisHome has been removed. You can still use the marketplace as normal.</p>';

    PERFORM net.http_post(
      url := (SELECT vault.decrypt_secret('SUPABASE_URL')) || '/functions/v1/send-mail',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT vault.decrypt_secret('SUPABASE_SERVICE_ROLE_KEY'))
      ),
      body := jsonb_build_object(
        'to', (SELECT email FROM auth.users WHERE id = _target_user_id),
        'subject', _subject,
        'html', _body
      )
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', _action, 'target', _target_user_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'admin_confirm_role_change: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'internal');
END;
$$;
