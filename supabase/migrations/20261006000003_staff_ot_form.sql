-- Staff OT Form: links staff records to logins, extends overtime_records and tightens who can see / change OT.

-- A staff record can be linked to the login account of that person (so they can submit / see their own OT).
alter table employees add column user_id uuid references profiles(id) on delete set null;
create unique index employees_company_user_key on employees(company_id, user_id) where user_id is not null;

-- Manager-level: Super Admin, Company Admin or Dept Manager for the company (or all companies).
create or replace function public.user_is_ot_manager(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and uca.role in ('super_admin', 'company_admin', 'dept_manager')
      and (uca.company_id = target_company_id or uca.company_id is null)
  );
$$;

create or replace function public.user_owns_employee(target_employee_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.employees e where e.id = target_employee_id and e.user_id = auth.uid());
$$;

revoke execute on function public.user_is_ot_manager(uuid) from public;
grant execute on function public.user_is_ot_manager(uuid) to authenticated;
revoke execute on function public.user_owns_employee(uuid) from public;
grant execute on function public.user_owns_employee(uuid) to authenticated;

alter table overtime_records
  add column normal_working_hours numeric(4,2),
  add column ot_start_time time,
  add column ot_end_time time,
  add column submitted_at timestamptz,
  add column document_id uuid references documents(id) on delete set null,
  add column reviewed_by uuid references profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column approved_hours numeric(5,2),
  add column manager_remarks text,
  add column exceeds_limit boolean not null default false,
  add column updated_at timestamptz not null default now();

update overtime_records set status = 'pending_approval' where status = 'pending';
alter table overtime_records drop constraint overtime_records_status_check;
alter table overtime_records add constraint overtime_records_status_check
  check (status in ('draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'cancelled'));
alter table overtime_records alter column status set default 'draft';

-- OT hours are always calculated from the start/end times (end earlier than start = past midnight),
-- and only a manager who is not the staff member can approve or reject.
create or replace function public.overtime_before_write()
returns trigger
language plpgsql
as $$
declare span interval;
begin
  if new.ot_start_time is not null and new.ot_end_time is not null then
    span := new.ot_end_time - new.ot_start_time;
    if span <= interval '0' then span := span + interval '24 hours'; end if;
    new.hours := round(extract(epoch from span) / 3600.0, 2);
  end if;
  new.updated_at := now();

  if auth.uid() is not null and tg_op = 'UPDATE'
     and new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    if not public.user_is_ot_manager(new.company_id) then
      raise exception 'Only a manager can approve or reject overtime.';
    end if;
    if public.user_owns_employee(new.employee_id) then
      raise exception 'You cannot approve or reject your own overtime.';
    end if;
  end if;
  return new;
end;
$$;

create trigger overtime_before_write before insert or update on overtime_records
  for each row execute function public.overtime_before_write();

-- Staff see and manage only their own OT; managers see their company's. Nothing is ever deleted.
drop policy overtime_records_all on overtime_records;
create policy overtime_records_select on overtime_records for select
  using (public.user_is_ot_manager(company_id) or public.user_owns_employee(employee_id));
create policy overtime_records_insert on overtime_records for insert
  with check (public.user_is_company_admin(company_id) or public.user_owns_employee(employee_id));
create policy overtime_records_update on overtime_records for update
  using (public.user_is_ot_manager(company_id) or public.user_owns_employee(employee_id))
  with check (public.user_is_ot_manager(company_id) or public.user_owns_employee(employee_id));
