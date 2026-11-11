-- Every staff member can change their own personal details (My Profile > Edit my details).
-- The database enforces it, the screens only mirror it:
--   * a staff record can be updated by a Super Admin (as before) or by the person it is linked to (user_id = their login);
--     before this, any colleague of the same company could update any staff record through the API;
--   * the person may change only the personal details below; name, IC number, email (also the login), position, department, dates,
--     employment type, status, branch, employee no., company and the linked login stay with the Super Admins;
--   * the person may read and write only their own bank / KWSP / SOCSO / tax details; salary (basic rate, pay basis, payment mode) stays with the admins.

-- ---------- staff record ----------
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update to authenticated
  using (company_id in (select public.user_company_ids()) and ((select public.current_user_is_super_admin()) or user_id = (select auth.uid())))
  with check (company_id in (select public.user_company_ids()) and ((select public.current_user_is_super_admin()) or user_id = (select auth.uid())));

create or replace function public.employees_guard_self_edit()
returns trigger language plpgsql set search_path = public as $$
declare
  allowed text[] := array[
    'phone', 'home_phone', 'passport_no', 'old_ic_no', 'date_of_birth', 'gender', 'nationality', 'race', 'religion', 'marital_status', 'short_name',
    'address_line', 'address_city', 'address_state', 'address_postcode', 'perm_address_line', 'perm_city', 'perm_state', 'perm_postcode',
    'spouse_name', 'spouse_ic_no', 'spouse_working', 'children_count', 'child_relief',
    'emergency_name', 'emergency_phone', 'emergency_relationship', 'education_background', 'working_experience'
  ];
begin
  -- the server with the service key (no signed-in user) and the Super Admins may change everything
  if auth.uid() is null or (select public.current_user_is_super_admin()) then
    return new;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'You can change your own personal details only. Ask HR to change the job details, name, IC number or email.';
  end if;
  return new;
end;
$$;
drop trigger if exists employees_guard_self_edit on public.employees;
create trigger employees_guard_self_edit before update on public.employees for each row execute function public.employees_guard_self_edit();

-- ---------- bank / KWSP / SOCSO / tax ----------
drop policy if exists employee_private_details_own on public.employee_private_details;
create policy employee_private_details_own on public.employee_private_details for all to authenticated
  using (employee_id in (select id from public.employees where user_id = (select auth.uid())))
  with check (employee_id in (select id from public.employees where user_id = (select auth.uid()) and company_id = employee_private_details.company_id));

-- the module gate (restrictive) lets a person in for their own row even when the HR module is not switched on for them
drop policy if exists employee_private_details_module_gate on public.employee_private_details;
create policy employee_private_details_module_gate on public.employee_private_details as restrictive for all
  using (company_id in (select public.user_module_company_ids('hr')) or employee_id in (select id from public.employees where user_id = (select auth.uid())))
  with check (company_id in (select public.user_module_company_ids('hr')) or employee_id in (select id from public.employees where user_id = (select auth.uid())));

create or replace function public.employee_private_details_guard_self_edit()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or (select public.current_user_is_super_admin()) or public.user_is_company_admin(new.company_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.basic_rate is not null or new.pay_basis is not null or new.payment_mode is not null then
      raise exception 'Salary details are set by HR.';
    end if;
  elsif new.basic_rate is distinct from old.basic_rate or new.pay_basis is distinct from old.pay_basis or new.payment_mode is distinct from old.payment_mode
     or new.employee_id is distinct from old.employee_id or new.company_id is distinct from old.company_id then
    raise exception 'Salary details are set by HR.';
  end if;
  return new;
end;
$$;
drop trigger if exists employee_private_details_guard_self_edit on public.employee_private_details;
create trigger employee_private_details_guard_self_edit before insert or update on public.employee_private_details for each row execute function public.employee_private_details_guard_self_edit();
