-- Everybody looks after their own Priority Centre: the person a task is given to may delete it too (as well as the person who created it and the
-- admins). A completed task is never deleted.
drop policy if exists priority_tasks_delete on public.priority_tasks;
create policy priority_tasks_delete on public.priority_tasks for delete using (
  status <> 'completed'
  and public.user_has_company_access(company_id)
  and (public.user_is_company_admin(company_id) or created_by = auth.uid() or responsible_id = auth.uid())
);
