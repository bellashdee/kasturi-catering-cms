-- Operation Management → Daily Duty Roster ("JADUAL DRIVER & OPERATION"): one roster per day for the drivers and operation staff.
-- Admins (Redza and Super Admins) create and change it; the roster staff and everyone with Operation Management see it.
-- Every save is written to ops_roster_changes (who, when, what changed, the whole day as it was saved), which is never changed.
-- OT here is a reference for HR and payroll only: it does not create OT claims.

create table if not exists public.ops_roster_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_roster_staff (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  short_name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_rosters (
  id uuid primary key default gen_random_uuid(),
  roster_date date not null unique,
  remarks text,
  version int not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_roster_entries (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references public.ops_rosters(id) on delete cascade,
  staff_id uuid not null references public.ops_roster_staff(id) on delete cascade,
  status text not null default 'on_duty' check (status in ('on_duty', 'off', 'leave', 'mc')),
  ot boolean not null default false,
  -- set by the admin to correct the OT worked out from the time slots
  ot_hours_override numeric(5, 2),
  note text,
  -- [{ "start": "05:00", "end": "07:00", "break_minutes": 0, "ot": false }]
  slots jsonb not null default '[]'::jsonb,
  -- [{ "type": "breakfast", "text": "3 & 4", "location": "Rumah", "time": "16:00" }]
  tasks jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  -- when this staff member's line last changed (to highlight it and tell them)
  changed_at timestamptz not null default now(),
  unique (roster_id, staff_id)
);
create index if not exists ops_roster_entries_staff_idx on public.ops_roster_entries(staff_id);

create table if not exists public.ops_roster_changes (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid references public.ops_rosters(id) on delete set null,
  roster_date date not null,
  version int not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  summary text not null,
  snapshot jsonb not null
);
create index if not exists ops_roster_changes_date_idx on public.ops_roster_changes(roster_date, changed_at desc);

create or replace function public.user_can_edit_ops_roster()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_is_super_admin() or exists (select 1 from public.ops_roster_editors where user_id = auth.uid());
$$;

create or replace function public.user_can_view_ops_roster()
returns boolean language sql stable security definer set search_path = public as $$
  select public.user_can_edit_ops_roster()
      or exists (select 1 from public.user_module_company_ids('driver-logistics'))
      or exists (
        select 1 from public.ops_roster_staff s
        join public.employees e on e.id = s.employee_id
        join public.employees mine on mine.user_id = auth.uid()
        where s.active and (e.user_id = auth.uid() or upper(btrim(e.full_name)) = upper(btrim(mine.full_name)))
      );
$$;
grant execute on function public.user_can_edit_ops_roster() to authenticated;
grant execute on function public.user_can_view_ops_roster() to authenticated;

alter table public.ops_roster_editors enable row level security;
alter table public.ops_roster_staff enable row level security;
alter table public.ops_rosters enable row level security;
alter table public.ops_roster_entries enable row level security;
alter table public.ops_roster_changes enable row level security;

drop policy if exists ops_roster_editors_select on public.ops_roster_editors;
create policy ops_roster_editors_select on public.ops_roster_editors for select to authenticated using (true);
drop policy if exists ops_roster_editors_write on public.ops_roster_editors;
create policy ops_roster_editors_write on public.ops_roster_editors for all to authenticated
  using (public.current_user_is_super_admin()) with check (public.current_user_is_super_admin());

do $$
declare t text;
begin
  foreach t in array array['ops_roster_staff', 'ops_rosters', 'ops_roster_entries'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.user_can_view_ops_roster())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.user_can_edit_ops_roster()) with check (public.user_can_edit_ops_roster())', t || '_write', t);
  end loop;
end $$;

-- the change history: read by those who see the roster, added to by the admins, never changed or deleted
drop policy if exists ops_roster_changes_select on public.ops_roster_changes;
create policy ops_roster_changes_select on public.ops_roster_changes for select to authenticated using (public.user_can_view_ops_roster());
drop policy if exists ops_roster_changes_insert on public.ops_roster_changes;
create policy ops_roster_changes_insert on public.ops_roster_changes for insert to authenticated with check (public.user_can_edit_ops_roster() and changed_by = auth.uid());

-- the names of the people who changed a roster
create or replace function public.ops_roster_people(target_user_ids uuid[])
returns table(user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select u.id, public.superior_display_name(u.id) from unnest(target_user_ids) as u(id) where public.user_can_view_ops_roster();
$$;
grant execute on function public.ops_roster_people(uuid[]) to authenticated;

-- the logins of roster staff (to tell them when their line changes)
create or replace function public.ops_roster_staff_logins(target_staff_ids uuid[])
returns table(staff_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select s.id, coalesce(e.user_id, (select o.user_id from public.employees o where upper(btrim(o.full_name)) = upper(btrim(e.full_name)) and o.user_id is not null limit 1))
  from public.ops_roster_staff s join public.employees e on e.id = s.employee_id
  where s.id = any(target_staff_ids) and public.user_can_edit_ops_roster();
$$;
grant execute on function public.ops_roster_staff_logins(uuid[]) to authenticated;

-- Redza is the roster admin (with the Super Admins)
insert into public.ops_roster_editors (user_id)
select distinct user_id from public.employees where full_name = 'MOHD REDZA BIN MOHAMED JASMIN' and user_id is not null
on conflict do nothing;

-- the six staff of the roster (Kasturi Indah records)
insert into public.ops_roster_staff (employee_id, short_name, sort_order)
select e.id, v.short_name, v.sort_order
from (values
  ('MOHD REDZA BIN MOHAMED JASMIN', 'REZA', 0),
  ('MUHAMAD FADIL BIN AHMAD', 'FADIL', 1),
  ('MUHAMMAD ZARIF BIN MOHD ASRI', 'ZARIF', 2),
  ('MUHAMMAD SYAMIE BIN SAIPULLAZIM', 'SYAMIE', 3),
  ('THIHA NAING (THIHA)', 'THIHA', 4),
  ('TUN TUN WIN (RAMLI)', 'RAMLI', 5)
) as v(full_name, short_name, sort_order)
join lateral (
  select e.id from public.employees e join public.companies c on c.id = e.company_id
  where e.full_name = v.full_name and e.status = 'active'
  order by (c.name ilike 'Kasturi Indah%') desc, e.created_at limit 1
) e on true
on conflict (employee_id) do nothing;

-- the signed-in person is on the roster (they get the Duty Roster tab in My Profile)
create or replace function public.user_is_ops_roster_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ops_roster_staff s
    join public.employees e on e.id = s.employee_id
    join public.employees mine on mine.user_id = auth.uid()
    where s.active and (e.user_id = auth.uid() or upper(btrim(e.full_name)) = upper(btrim(mine.full_name)))
  );
$$;
grant execute on function public.user_is_ops_roster_staff() to authenticated;
