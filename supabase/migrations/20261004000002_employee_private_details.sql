-- Staff bank account and KWSP (EPF) number. Kept out of `employees` on purpose:
-- that table is readable by everyone with access to the company, while these
-- numbers should only be visible to a Super Admin or Company Admin.

create or replace function public.user_is_company_admin(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and uca.role in ('super_admin', 'company_admin')
      and (uca.company_id = target_company_id or uca.company_id is null)
  );
$$;

revoke execute on function public.user_is_company_admin(uuid) from public;
grant execute on function public.user_is_company_admin(uuid) to authenticated;

create table employee_private_details (
  employee_id uuid primary key references employees(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  bank_name text,
  bank_account_no text,
  epf_no text,
  updated_at timestamptz not null default now()
);

create index employee_private_details_company_idx on employee_private_details(company_id);

alter table employee_private_details enable row level security;
create policy employee_private_details_admin_all on employee_private_details
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));
