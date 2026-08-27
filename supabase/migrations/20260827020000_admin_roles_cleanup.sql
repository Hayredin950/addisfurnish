-- Drop the superseded role-change RPC overloads. The canonical signatures
-- used by both web and mobile clients are:
--   admin_request_role_change(uuid, text, text)  -- (target, role, action)
--   admin_confirm_role_change(text)              -- (code)
-- The old promote/demote-only overloads are no longer called anywhere and
-- only create ambiguity, so we remove them.

drop function if exists public.admin_request_role_change(uuid, text);
drop function if exists public.admin_request_role_change(uuid, text, uuid);
drop function if exists public.admin_confirm_role_change(uuid, text, text, uuid);
