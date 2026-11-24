-- Leave balance set by hand (My Profile / HR staff profile → Leave Balance → Edit balance): the AL / MC already taken before the system
-- was used, and the company's own entitlement where it differs from the Employment Act. One row per staff member per year.
create table if not exists public.leave_balance_adjustments (
  employee_id uuid not null references employees(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  al_entitled numeric(5, 1) check (al_entitled is null or (al_entitled >= 0 and al_entitled <= 365)),
  al_taken_before numeric(5, 1) not null default 0 check (al_taken_before >= 0 and al_taken_before <= 365),
  mc_entitled numeric(5, 1) check (mc_entitled is null or (mc_entitled >= 0 and mc_entitled <= 365)),
  mc_taken_before numeric(5, 1) not null default 0 check (mc_taken_before >= 0 and mc_taken_before <= 365),
  notes text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (employee_id, year)
);

alter table public.leave_balance_adjustments enable row level security;
drop policy if exists leave_balance_adjustments_select on public.leave_balance_adjustments;
create policy leave_balance_adjustments_select on public.leave_balance_adjustments for select to authenticated
  using (public.user_owns_employee(employee_id) or public.user_is_company_admin(company_id) or public.user_is_leave_editor() or public.user_can_view_staff_leave());
drop policy if exists leave_balance_adjustments_write on public.leave_balance_adjustments;
create policy leave_balance_adjustments_write on public.leave_balance_adjustments for all to authenticated
  using (public.user_is_company_admin(company_id) or public.user_is_leave_editor())
  with check (public.user_is_company_admin(company_id) or public.user_is_leave_editor());
