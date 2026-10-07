-- Overtime can be granted on its own ("overtime" module) without the rest of HR.
drop policy overtime_records_module_gate on overtime_records;
create policy overtime_records_module_gate on overtime_records as restrictive for all
  using (public.user_has_module(company_id, 'hr') or public.user_has_module(company_id, 'overtime'))
  with check (public.user_has_module(company_id, 'hr') or public.user_has_module(company_id, 'overtime'));
