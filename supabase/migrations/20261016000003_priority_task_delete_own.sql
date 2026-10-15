-- Everyone may delete a task they created themselves (admins any open task of their company); completed tasks are never deleted.
drop policy priority_tasks_delete on public.priority_tasks;
create policy priority_tasks_delete on public.priority_tasks for delete using (
  status <> 'completed'
  and public.user_has_company_access(company_id)
  and (public.user_is_company_admin(company_id) or created_by = auth.uid())
);
