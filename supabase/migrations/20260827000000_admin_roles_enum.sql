-- Extend app_role with the granular admin roles.
-- Kept in its own migration so each ADD VALUE commits before any other
-- migration references the new enum values (the "unsafe use of new value of
-- enum type" PG restriction blocks using them in the same transaction).

alter type public.app_role add value if not exists 'verification';
alter type public.app_role add value if not exists 'category_manager';
alter type public.app_role add value if not exists 'analytics';
