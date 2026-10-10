-- HRMS: leave and attendance integrity (approved fix, applied to a test project first).
-- Depends on 20261010000001 (helper functions, audit trigger function).
-- Rules enforced in the database, so they hold even if someone calls the API directly:
--   * employees see only their own leave/attendance; managers only their authorised employees; HR their company
--   * nobody can approve or reject their own leave
--   * a decided leave request is final (no flipping approved <-> rejected, no editing its dates)
--   * no overlapping pending/approved leave for the same employee
--   * employees cannot write attendance directly (HR corrections only; the clock-in flow arrives in the attendance phase)

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Who may review (approve/reject/correct) an employee's request: HR Admin of the company or the employee's
--    authorised manager — and never the employee themself.
-- ---------------------------------------------------------------------------
create or replace function public.user_can_review_employee(target_employee_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select not public.user_owns_employee(target_employee_id)
    and (
      public.user_manages_employee(target_employee_id)
      or exists (select 1 from public.employees e where e.id = target_employee_id and public.user_is_hr_admin(e.company_id))
    );
$$;
revoke execute on function public.user_can_review_employee(uuid) from public, anon;
grant execute on function public.user_can_review_employee(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Leave requests: validity and no overlaps.
--    (leave_requests had 0 rows in production when this was written, so existing data cannot conflict.)
-- ---------------------------------------------------------------------------
alter table leave_requests add constraint leave_requests_dates_check check (end_date >= start_date);
alter table leave_requests add constraint leave_requests_days_check check (days > 0);
alter table leave_requests add constraint leave_requests_no_overlap
  exclude using gist (employee_id with =, daterange(start_date, end_date, '[]') with &&)
  where (status in ('pending', 'approved'));

-- Rejected requests no longer block the dates, so an employee can re-apply after a rejection.

create or replace function public.leave_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- maintenance jobs running without a signed-in user

  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception 'A new leave request must start as pending.'; end if;
    return new;
  end if;

  if new.employee_id <> old.employee_id or new.company_id <> old.company_id then
    raise exception 'The employee and company of a leave request cannot be changed.';
  end if;
  if old.status <> 'pending'
     and (new.start_date <> old.start_date or new.end_date <> old.end_date or new.days <> old.days or new.leave_type <> old.leave_type) then
    raise exception 'A decided leave request cannot be edited.';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' then raise exception 'This leave request has already been decided.'; end if;
    if new.status in ('approved', 'rejected') and not public.user_can_review_employee(new.employee_id) then
      raise exception 'You are not allowed to approve or reject this leave request. Reviewers cannot decide their own leave.';
    end if;
  end if;
  return new;
end;
$$;
create trigger leave_requests_before_write before insert or update on leave_requests
  for each row execute function public.leave_before_write();

-- The shared approvals row for a leave request follows the same rule.
create or replace function public.approvals_guard()
returns trigger language plpgsql set search_path = public as $$
declare emp uuid;
begin
  if auth.uid() is null then return new; end if;
  if new.related_table = 'leave_requests' and new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    select employee_id into emp from public.leave_requests where id = new.related_id;
    if emp is null or not public.user_can_review_employee(emp) then
      raise exception 'You are not allowed to decide this leave approval.';
    end if;
  end if;
  return new;
end;
$$;
create trigger approvals_guard_trigger before update on approvals
  for each row execute function public.approvals_guard();

-- Policies: replace the old "anyone in the company can do anything" policy.
drop policy leave_requests_all on leave_requests;
create policy leave_requests_select on leave_requests for select to authenticated using (
  public.user_is_hr_admin(company_id) or public.user_is_director(company_id)
  or public.user_owns_employee(employee_id) or public.user_manages_employee(employee_id)
);
create policy leave_requests_insert on leave_requests for insert to authenticated with check (
  (public.user_is_hr_admin(company_id) or public.user_owns_employee(employee_id))
  and exists (select 1 from public.employees e where e.id = employee_id and e.company_id = leave_requests.company_id)
);
create policy leave_requests_update on leave_requests for update to authenticated
  using (public.user_is_hr_admin(company_id) or public.user_owns_employee(employee_id) or public.user_manages_employee(employee_id))
  with check (public.user_is_hr_admin(company_id) or public.user_owns_employee(employee_id) or public.user_manages_employee(employee_id));
create policy leave_requests_delete on leave_requests for delete to authenticated using (public.user_is_hr_admin(company_id));

-- ---------------------------------------------------------------------------
-- 3. Attendance: read by scope; written only by HR (corrections). Employees cannot insert or edit their own times.
--    unique (employee_id, work_date) already prevents two records for the same day.
-- ---------------------------------------------------------------------------
drop policy attendance_records_all on attendance_records;
create policy attendance_records_select on attendance_records for select to authenticated using (
  public.user_is_hr_admin(company_id) or public.user_is_director(company_id)
  or public.user_owns_employee(employee_id) or public.user_manages_employee(employee_id)
);
create policy attendance_records_insert on attendance_records for insert to authenticated with check (
  public.user_is_hr_admin(company_id)
  and exists (select 1 from public.employees e where e.id = employee_id and e.company_id = attendance_records.company_id)
);
create policy attendance_records_update on attendance_records for update to authenticated
  using (public.user_is_hr_admin(company_id)) with check (public.user_is_hr_admin(company_id));
create policy attendance_records_delete on attendance_records for delete to authenticated using (public.user_is_hr_admin(company_id));

-- ---------------------------------------------------------------------------
-- 4. Audit trail for both tables (column names only, never values).
-- ---------------------------------------------------------------------------
create trigger leave_requests_audit after insert or update or delete on leave_requests for each row execute function public.audit_row_change();
create trigger attendance_records_audit after insert or update or delete on attendance_records for each row execute function public.audit_row_change();
