-- Wastage Log of the restaurant (O2 Life): the food thrown away, recorded for information only.
-- It is NOT added to any cost: the food bought is already counted as a cost by day in Company Expenses, so a wastage cost would count the same food twice.
-- Read: anybody who may see the company. Write: people of the Kitchen module of the company. Edit / delete: who recorded it, or an admin of the company.

create table if not exists public.wastage_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  wasted_on date not null default ((now() at time zone 'Asia/Kuala_Lumpur')::date),
  item text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit text,
  reason text not null,
  estimated_value numeric(12,2) check (estimated_value is null or estimated_value >= 0),
  notes text,
  document_id uuid references public.documents(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wastage_log_company_date_idx on public.wastage_log (company_id, wasted_on);

alter table public.wastage_log enable row level security;

create policy wastage_log_select on public.wastage_log for select to authenticated
  using (company_id in (select public.user_company_ids()));

create policy wastage_log_insert on public.wastage_log for insert to authenticated
  with check (company_id in (select public.user_module_company_ids('kitchen')));

create policy wastage_log_update on public.wastage_log for update to authenticated
  using (company_id in (select public.user_module_company_ids('kitchen')) and (created_by = (select auth.uid()) or company_id in (select public.user_admin_company_ids())))
  with check (company_id in (select public.user_module_company_ids('kitchen')));

create policy wastage_log_delete on public.wastage_log for delete to authenticated
  using (company_id in (select public.user_module_company_ids('kitchen')) and (created_by = (select auth.uid()) or company_id in (select public.user_admin_company_ids())));

create trigger wastage_log_set_updated_at before update on public.wastage_log for each row execute function public.set_updated_at();
