-- A staff document (certificate, MC, LOA, licence ...) can be deleted (and put back with Undo) by the admins of the company.
drop policy if exists employee_certificates_delete on public.employee_certificates;
create policy employee_certificates_delete on public.employee_certificates for delete to authenticated
  using (public.user_is_company_admin(company_id));
