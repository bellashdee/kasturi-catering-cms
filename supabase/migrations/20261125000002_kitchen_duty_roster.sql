-- Kitchen Duty Roster: the monthly shift schedule of the kitchen staff, like "KILANG 1 DUTY ROASTER 2026.xlsx".
-- One roster per company, kitchen (e.g. KILANG 1) and month; one row per staff member; each day holds a shift code.
-- Everyone of the company with access can see it; only the roster editors (Chef Atiq) and Super Admins change it.

create table if not exists public.kitchen_roster_shift_codes (
  code text primary key,
  label text not null,
  start_time time,
  end_time time,
  is_work boolean not null default true,
  color text not null default 'neutral',
  sort_order int not null default 100
);

insert into public.kitchen_roster_shift_codes (code, label, start_time, end_time, is_work, color, sort_order) values
  ('N',   'Normal',                 '09:00', '18:00', true,  'blue',    10),
  ('A1',  'Shift A1',               '04:00', '12:00', true,  'violet',  20),
  ('A2',  'Shift A2',               '04:00', '16:00', true,  'violet',  30),
  ('A3',  'Shift A3',               '06:00', '14:00', true,  'teal',    40),
  ('A4',  'Shift A4',               '06:00', '18:00', true,  'teal',    50),
  ('A5',  'Shift A5',               '08:00', '16:00', true,  'green',   60),
  ('R1',  'Shift R1',               '09:00', '17:00', true,  'green',   70),
  ('OD',  'Off day',                null,    null,    false, 'gray',    80),
  ('PH',  'Public holiday',         null,    null,    false, 'red',     90),
  ('ROD', 'Replacement off day',    null,    null,    false, 'orange', 100),
  ('RPH', 'Replacement public holiday', null, null,   false, 'orange', 110),
  ('AL',  'Annual leave',           null,    null,    false, 'amber',  120),
  ('MC',  'Medical leave',          null,    null,    false, 'pink',   130),
  ('EL',  'Emergency leave',        null,    null,    false, 'pink',   140)
on conflict (code) do nothing;

create table if not exists public.kitchen_roster_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.kitchen_rosters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kitchen text not null default 'KILANG 1',
  month date not null,
  public_holidays int[] not null default '{}',
  notes text,
  prepared_by uuid references auth.users(id) on delete set null,
  prepared_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kitchen_rosters_month_first_day check (extract(day from month) = 1),
  constraint kitchen_rosters_unique unique (company_id, kitchen, month)
);

create table if not exists public.kitchen_roster_rows (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references public.kitchen_rosters(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  display_name text not null,
  sort_order int not null default 0,
  -- the shift code of each day of the month: {"1": "N", "2": "OD", ...}
  codes jsonb not null default '{}'::jsonb
);
create index if not exists kitchen_roster_rows_roster_idx on public.kitchen_roster_rows(roster_id, sort_order);

create or replace function public.user_can_edit_kitchen_roster()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_is_super_admin() or exists (select 1 from public.kitchen_roster_editors where user_id = auth.uid());
$$;
grant execute on function public.user_can_edit_kitchen_roster() to authenticated;

alter table public.kitchen_roster_shift_codes enable row level security;
alter table public.kitchen_roster_editors enable row level security;
alter table public.kitchen_rosters enable row level security;
alter table public.kitchen_roster_rows enable row level security;

drop policy if exists kitchen_roster_shift_codes_select on public.kitchen_roster_shift_codes;
create policy kitchen_roster_shift_codes_select on public.kitchen_roster_shift_codes for select to authenticated using (true);
drop policy if exists kitchen_roster_shift_codes_write on public.kitchen_roster_shift_codes;
create policy kitchen_roster_shift_codes_write on public.kitchen_roster_shift_codes for all to authenticated
  using (public.user_can_edit_kitchen_roster()) with check (public.user_can_edit_kitchen_roster());

drop policy if exists kitchen_roster_editors_select on public.kitchen_roster_editors;
create policy kitchen_roster_editors_select on public.kitchen_roster_editors for select to authenticated using (true);
drop policy if exists kitchen_roster_editors_write on public.kitchen_roster_editors;
create policy kitchen_roster_editors_write on public.kitchen_roster_editors for all to authenticated
  using (public.current_user_is_super_admin()) with check (public.current_user_is_super_admin());

drop policy if exists kitchen_rosters_select on public.kitchen_rosters;
create policy kitchen_rosters_select on public.kitchen_rosters for select to authenticated
  using (company_id in (select public.user_company_ids()));
drop policy if exists kitchen_rosters_write on public.kitchen_rosters;
create policy kitchen_rosters_write on public.kitchen_rosters for all to authenticated
  using (public.user_can_edit_kitchen_roster() and company_id in (select public.user_company_ids()))
  with check (public.user_can_edit_kitchen_roster() and company_id in (select public.user_company_ids()));

drop policy if exists kitchen_roster_rows_select on public.kitchen_roster_rows;
create policy kitchen_roster_rows_select on public.kitchen_roster_rows for select to authenticated
  using (exists (select 1 from public.kitchen_rosters r where r.id = roster_id and r.company_id in (select public.user_company_ids())));
drop policy if exists kitchen_roster_rows_write on public.kitchen_roster_rows;
create policy kitchen_roster_rows_write on public.kitchen_roster_rows for all to authenticated
  using (public.user_can_edit_kitchen_roster() and exists (select 1 from public.kitchen_rosters r where r.id = roster_id and r.company_id in (select public.user_company_ids())))
  with check (public.user_can_edit_kitchen_roster() and exists (select 1 from public.kitchen_rosters r where r.id = roster_id and r.company_id in (select public.user_company_ids())));

-- Chef Atiq edits the roster
insert into public.kitchen_roster_editors (user_id)
select distinct e.user_id from public.employees e where e.full_name = 'MUHAMMAD ATIQUFARHAN BIN AB HAMID' and e.user_id is not null
on conflict do nothing;

-- the names of the people who prepared / approved a roster (any signed-in user may read these two names)
create or replace function public.kitchen_roster_people(target_roster_id uuid)
returns table(prepared_name text, approved_name text)
language sql stable security definer set search_path = public as $$
  select public.superior_display_name(r.prepared_by), public.superior_display_name(r.approved_by)
  from public.kitchen_rosters r
  where r.id = target_roster_id and r.company_id in (select public.user_company_ids());
$$;
grant execute on function public.kitchen_roster_people(uuid) to authenticated;
