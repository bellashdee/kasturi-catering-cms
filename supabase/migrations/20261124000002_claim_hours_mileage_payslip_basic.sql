-- 1. Payroll: the basic salary on the payslip is kept with the month's payroll record (Finance only), so the system knows who earns
--    RM4,000 and above. (employee_private_details does not hold any salary.)
alter table public.payroll_records add column if not exists basic_pay numeric(12, 2) check (basic_pay is null or basic_pay >= 0);

-- The staff member's monthly basic salary: the basic of the latest payslip; the gross of the latest payslip when no basic was kept.
create or replace function public.employee_monthly_basic(target_employee_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select basic_pay from payroll_records where employee_id = target_employee_id and basic_pay is not null order by pay_period_start desc limit 1),
    (select gross_pay from payroll_records where employee_id = target_employee_id order by pay_period_start desc limit 1)
  );
$$;
revoke all on function public.employee_monthly_basic(uuid) from public, anon, authenticated;

-- 2. Staff with a salary of RM4,000 and above cannot claim OT. When they work extra hours they claim the hours instead, and every
--    8 approved hours give them 1 day of Replacement Leave (Cuti Gantian).
create or replace function public.employee_uses_claim_hours(target_employee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.employee_monthly_basic(target_employee_id), 0) >= 4000
    and (
      public.user_owns_employee(target_employee_id)
      or exists (select 1 from employees e where e.id = target_employee_id and (public.user_is_company_admin(e.company_id) or public.user_is_ot_manager(e.company_id)))
      or public.user_is_staff_leave_ot_viewer()
      or public.user_is_leave_editor()
    );
$$;
grant execute on function public.employee_uses_claim_hours(uuid) to authenticated;

create table if not exists public.claim_hours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  hours numeric(5, 2) not null check (hours > 0 and hours <= 24),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_hours numeric(5, 2) check (approved_hours is null or (approved_hours >= 0 and approved_hours <= 24)),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  manager_remarks text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists claim_hours_employee_idx on public.claim_hours (employee_id, work_date desc);
create index if not exists claim_hours_company_idx on public.claim_hours (company_id, status);

-- Hours, days earned (every full 8 approved hours), Replacement Leave days already taken (approved or waiting) and the days left.
create or replace function public.claim_hours_balance(target_employee_id uuid)
returns table (approved_hours numeric, earned_days numeric, used_days numeric, balance_days numeric, hours_to_next_day numeric)
language sql stable security definer set search_path = public as $$
  with h as (
    select coalesce(sum(coalesce(c.approved_hours, c.hours)), 0) as hrs from claim_hours c where c.employee_id = target_employee_id and c.status = 'approved'
  ), u as (
    select coalesce(sum(l.days), 0) as days from leave_requests l where l.employee_id = target_employee_id and l.leave_type = 'replacement' and l.status in ('approved', 'pending')
  )
  select h.hrs, floor(h.hrs / 8), u.days, floor(h.hrs / 8) - u.days, 8 - mod(h.hrs, 8)
  from h, u
  where public.user_owns_employee(target_employee_id)
     or exists (select 1 from employees e where e.id = target_employee_id and (public.user_is_company_admin(e.company_id) or public.user_is_ot_manager(e.company_id)))
     or public.user_is_staff_leave_ot_viewer()
     or public.user_is_leave_editor();
$$;
grant execute on function public.claim_hours_balance(uuid) to authenticated;

create or replace function public.claim_hours_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists claim_hours_touch on public.claim_hours;
create trigger claim_hours_touch before update on public.claim_hours for each row execute function public.claim_hours_touch();

alter table public.claim_hours enable row level security;
drop policy if exists claim_hours_select on public.claim_hours;
create policy claim_hours_select on public.claim_hours for select to authenticated
  using (public.user_owns_employee(employee_id) or public.user_is_company_admin(company_id) or public.user_is_ot_manager(company_id) or public.user_can_approve_ot(company_id)
         or (public.user_is_staff_leave_ot_viewer() and company_id in (select public.user_company_ids())));
drop policy if exists claim_hours_insert on public.claim_hours;
create policy claim_hours_insert on public.claim_hours for insert to authenticated
  with check (status = 'pending' and (public.user_owns_employee(employee_id) or public.user_is_ot_manager(company_id) or public.user_is_company_admin(company_id)));
drop policy if exists claim_hours_update on public.claim_hours;
create policy claim_hours_update on public.claim_hours for update to authenticated
  using (public.user_is_ot_manager(company_id) or public.user_can_approve_ot(company_id) or public.user_is_company_admin(company_id) or (public.user_owns_employee(employee_id) and status = 'pending'))
  with check (public.user_is_ot_manager(company_id) or public.user_can_approve_ot(company_id) or public.user_is_company_admin(company_id) or (public.user_owns_employee(employee_id) and status = 'pending'));
drop policy if exists claim_hours_delete on public.claim_hours;
create policy claim_hours_delete on public.claim_hours for delete to authenticated
  using ((public.user_owns_employee(employee_id) and status in ('pending', 'rejected')) or public.user_is_company_admin(company_id));

-- OT is refused for staff of RM4,000 and above (checked when the OT record is made).
create or replace function public.overtime_block_claim_hours_staff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.employee_monthly_basic(new.employee_id), 0) >= 4000 then
    raise exception 'Staff with a salary of RM4,000 and above cannot claim OT. Please use Claim Hours in My Profile instead (every 8 hours = 1 day of replacement leave).'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists overtime_block_claim_hours_staff on public.overtime_records;
create trigger overtime_block_claim_hours_staff before insert on public.overtime_records for each row execute function public.overtime_block_claim_hours_staff();

-- Replacement Leave of a claim-hours staff cannot be more than the days earned from the claimed hours.
create or replace function public.leave_check_claim_hours_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  earned numeric;
  used numeric;
begin
  if new.leave_type <> 'replacement' or new.status = 'rejected' then
    return new;
  end if;
  if coalesce(public.employee_monthly_basic(new.employee_id), 0) < 4000 then
    return new;
  end if;
  select floor(coalesce(sum(coalesce(c.approved_hours, c.hours)), 0) / 8) into earned from claim_hours c where c.employee_id = new.employee_id and c.status = 'approved';
  select coalesce(sum(l.days), 0) into used from leave_requests l
    where l.employee_id = new.employee_id and l.leave_type = 'replacement' and l.status in ('approved', 'pending') and l.id <> new.id;
  if used + coalesce(new.days, 0) > earned then
    raise exception 'Not enough claimed hours for this replacement leave: % day(s) earned from claimed hours, % already taken or waiting. Every 8 approved claim hours = 1 day.', earned, used
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists leave_check_claim_hours_balance on public.leave_requests;
create trigger leave_check_claim_hours_balance before insert or update of days, leave_type, status on public.leave_requests for each row execute function public.leave_check_claim_hours_balance();

-- 3. Mileage Log (My Profile → Mileage Claim): each trip with the start and end odometer reading and a purpose code
--    (1 Business, 2 Personal / Commuting, 3 Fuel, 4 Maintenance, 5 Other), plus a note for the month.
create table if not exists public.mileage_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  trip_date date not null,
  from_place text not null,
  to_place text not null,
  purpose text,
  start_km numeric(10, 1) not null check (start_km >= 0),
  end_km numeric(10, 1) not null,
  total_km numeric(10, 1) generated always as (end_km - start_km) stored,
  purpose_code smallint not null default 1 check (purpose_code between 1 and 5),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mileage_logs_end_after_start check (end_km >= start_km)
);
create index if not exists mileage_logs_employee_idx on public.mileage_logs (employee_id, trip_date);

create table if not exists public.mileage_log_months (
  employee_id uuid not null references employees(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  month date not null,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (employee_id, month)
);

alter table public.mileage_logs enable row level security;
alter table public.mileage_log_months enable row level security;
drop policy if exists mileage_logs_select on public.mileage_logs;
create policy mileage_logs_select on public.mileage_logs for select to authenticated
  using (public.user_owns_employee(employee_id) or public.user_is_company_admin(company_id));
drop policy if exists mileage_logs_write on public.mileage_logs;
create policy mileage_logs_write on public.mileage_logs for all to authenticated
  using (public.user_owns_employee(employee_id) or public.user_is_company_admin(company_id))
  with check (public.user_owns_employee(employee_id) or public.user_is_company_admin(company_id));
drop policy if exists mileage_log_months_all on public.mileage_log_months;
create policy mileage_log_months_all on public.mileage_log_months for all to authenticated
  using (public.user_owns_employee(employee_id) or public.user_is_company_admin(company_id))
  with check (public.user_owns_employee(employee_id) or public.user_is_company_admin(company_id));
