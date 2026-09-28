-- documents: readable + writable by anyone with company access
alter table documents enable row level security;
create policy "documents_all" on documents for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- employees: add write access (select policy already exists from migration 004)
create policy "employees_insert" on employees for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "employees_update" on employees for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- employee_certificates: add write access (select policy already exists)
create policy "employee_certificates_insert" on employee_certificates for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "employee_certificates_update" on employee_certificates for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table leave_requests enable row level security;
create policy "leave_requests_all" on leave_requests for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table overtime_records enable row level security;
create policy "overtime_records_all" on overtime_records for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table attendance_records enable row level security;
create policy "attendance_records_all" on attendance_records for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table payroll_records enable row level security;
create policy "payroll_records_all" on payroll_records for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- approvals: HR leave requests need to create + update these now (select policy already exists)
create policy "approvals_insert" on approvals for insert to authenticated
  with check (company_id is null or public.user_has_company_access(company_id));
create policy "approvals_update" on approvals for update to authenticated
  using (company_id is null or public.user_has_company_access(company_id))
  with check (company_id is null or public.user_has_company_access(company_id));
