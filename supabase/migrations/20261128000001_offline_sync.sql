-- Offline-first sync (branch feature/offline-first-pwa). NOT applied to production until approved.
--
-- offline_mutations: one row per change a device sent from its offline queue. The primary key is the id the device gave the change
-- (its idempotency key): the same change sent twice (a retry after a lost answer, two tabs, a second device) is recognised and never
-- applied twice. Written by POST /api/sync running as the signed-in person (never the service role).
--
-- sync_conflicts: a change made offline on a record that somebody else changed (or deleted) in the meantime. Both versions are kept,
-- with who made the offline change, from which device and when; nothing is overwritten until the person chooses.

create table if not exists public.offline_mutations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 100),
  op text not null check (char_length(op) between 1 and 100),
  status text not null check (status in ('applied', 'conflict', 'rejected')),
  result jsonb,
  client_created_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists offline_mutations_user_idx on public.offline_mutations (user_id, received_at desc);

alter table public.offline_mutations enable row level security;

-- each person only sees and writes the record of their own changes
create policy offline_mutations_select on public.offline_mutations for select to authenticated
  using (user_id = (select auth.uid()));
create policy offline_mutations_insert on public.offline_mutations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy offline_mutations_update on public.offline_mutations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  mutation_id uuid not null unique,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 100),
  op text not null,
  table_name text not null,
  record_id uuid,
  company_id uuid references public.companies (id) on delete set null,
  -- what the person changed offline, and the version they started from
  local_version jsonb not null,
  base_version jsonb,
  -- the record as it was on the server when the change arrived (null = it had been deleted)
  server_version jsonb,
  detected_at timestamptz not null default now(),
  resolution text check (resolution in ('kept_mine', 'kept_server')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id)
);

create index if not exists sync_conflicts_user_idx on public.sync_conflicts (user_id, detected_at desc);
create index if not exists sync_conflicts_company_idx on public.sync_conflicts (company_id) where resolved_at is null;

alter table public.sync_conflicts enable row level security;

-- the person who made the change, and the admins of the company, can see a conflict; only the person who made it records the choice
create policy sync_conflicts_select on public.sync_conflicts for select to authenticated
  using (user_id = (select auth.uid()) or company_id in (select public.user_admin_company_ids()));
create policy sync_conflicts_insert on public.sync_conflicts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sync_conflicts_update on public.sync_conflicts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
