-- Internal user-management feature: each profile can have a distinct
-- username (separate from their login email) that Admins see and manage.
-- Nullable — existing accounts aren't force-backfilled with a guessed value.
alter table profiles add column if not exists username text unique;
