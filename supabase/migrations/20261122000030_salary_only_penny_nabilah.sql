-- The basic rate (salary) of a staff member can be seen and changed only by the people in payroll_centre_access (Ms. Penny Chan and Ms. Nabilah).
-- Until now it sat in employee_private_details, which every admin of the company (and the staff member, for their own row) can read.
-- It now lives in its own table whose only policy is user_can_use_payroll_centre(), the same rule as payroll_records.

create table if not exists public.employee_salaries (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  basic_rate numeric,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.employee_salaries enable row level security;
revoke all on public.employee_salaries from anon;

drop policy if exists employee_salaries_payroll_access on public.employee_salaries;
create policy employee_salaries_payroll_access on public.employee_salaries
  for all to authenticated
  using (public.user_can_use_payroll_centre())
  with check (public.user_can_use_payroll_centre());

-- the rates already keyed in move across; nothing is lost
insert into public.employee_salaries (employee_id, company_id, basic_rate)
select employee_id, company_id, basic_rate
from public.employee_private_details
where basic_rate is not null
on conflict (employee_id) do nothing;

-- and are removed from the table the admins and the staff can read; nobody can write a salary there again
update public.employee_private_details set basic_rate = null where basic_rate is not null;
alter table public.employee_private_details drop constraint if exists employee_private_details_no_salary;
alter table public.employee_private_details add constraint employee_private_details_no_salary check (basic_rate is null);

-- the old copy taken on 4 Nov 2026 holds salaries too: closed to everyone but the database owner
revoke all on public.bak_employee_private_20261104 from anon, authenticated;
