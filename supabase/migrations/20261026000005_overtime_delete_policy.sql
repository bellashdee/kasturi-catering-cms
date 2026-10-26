-- An OT that no longer counts (a draft, a cancelled or a rejected one) can be deleted by the staff member it belongs to or by an OT manager.
-- An approved or waiting OT must be cancelled first. The deletion is written to the audit log by the app.
drop policy if exists overtime_records_delete on public.overtime_records;
create policy overtime_records_delete on public.overtime_records for delete to authenticated
  using (status in ('draft', 'cancelled', 'rejected') and (public.user_is_ot_manager(company_id) or public.user_owns_employee(employee_id)));
