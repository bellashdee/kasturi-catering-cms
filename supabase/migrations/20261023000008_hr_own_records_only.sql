-- HR: leave requests and staff documents are for the company admins; everyone else sees only their own.
drop policy if exists leave_requests_all on public.leave_requests;
create policy leave_requests_all on public.leave_requests
  for all to authenticated
  using (public.user_is_company_admin(company_id) or public.user_owns_employee(employee_id))
  with check (public.user_is_company_admin(company_id) or public.user_owns_employee(employee_id));

drop policy if exists employee_certificates_select on public.employee_certificates;
create policy employee_certificates_select on public.employee_certificates
  for select to authenticated
  using (public.user_is_company_admin(company_id) or public.user_owns_employee(employee_id));

drop policy if exists employee_certificates_update on public.employee_certificates;
create policy employee_certificates_update on public.employee_certificates
  for update to authenticated
  using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));
