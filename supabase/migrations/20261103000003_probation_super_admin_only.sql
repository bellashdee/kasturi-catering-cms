-- Probation notes, evidence and letters are for the Super Admins only (Madam Penny and Nabilah), like the rest of the staff data.
drop policy if exists employee_probation_select on public.employee_probation;
drop policy if exists employee_probation_insert on public.employee_probation;
drop policy if exists employee_probation_update on public.employee_probation;
drop policy if exists employee_probation_events_select on public.employee_probation_events;
drop policy if exists employee_probation_events_insert on public.employee_probation_events;
drop policy if exists employee_probation_events_update on public.employee_probation_events;

create policy employee_probation_select on public.employee_probation for select to authenticated using (public.current_user_is_super_admin());
create policy employee_probation_insert on public.employee_probation for insert to authenticated with check (public.current_user_is_super_admin());
create policy employee_probation_update on public.employee_probation for update to authenticated using (public.current_user_is_super_admin()) with check (public.current_user_is_super_admin());
create policy employee_probation_events_select on public.employee_probation_events for select to authenticated using (public.current_user_is_super_admin());
create policy employee_probation_events_insert on public.employee_probation_events for insert to authenticated with check (public.current_user_is_super_admin());
create policy employee_probation_events_update on public.employee_probation_events for update to authenticated using (public.current_user_is_super_admin()) with check (public.current_user_is_super_admin());
