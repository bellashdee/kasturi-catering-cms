-- Operation Management → Equipment Checklist: the catering equipment sent out to an event and brought back (TEMPLATE EQUIPMENT CATERING.xlsx).
create table if not exists public.equipment_checklists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  catering_event_id uuid not null unique references public.catering_events(id) on delete cascade,
  -- [{ "name": "Dome Set", "side": "left" | "right", "out": 10, "in": 9 }]
  items jsonb not null default '[]'::jsonb,
  notes text,
  out_prepared_by uuid references auth.users(id) on delete set null,
  out_prepared_at timestamptz,
  out_checked_by uuid references auth.users(id) on delete set null,
  out_checked_at timestamptz,
  in_received_by uuid references auth.users(id) on delete set null,
  in_received_at timestamptz,
  in_checked_by uuid references auth.users(id) on delete set null,
  in_checked_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists equipment_checklists_company_idx on public.equipment_checklists(company_id);

alter table public.equipment_checklists enable row level security;
drop policy if exists equipment_checklists_all on public.equipment_checklists;
create policy equipment_checklists_all on public.equipment_checklists for all to authenticated
  using (company_id in (select public.user_module_company_ids('driver-logistics')))
  with check (company_id in (select public.user_module_company_ids('driver-logistics')));
