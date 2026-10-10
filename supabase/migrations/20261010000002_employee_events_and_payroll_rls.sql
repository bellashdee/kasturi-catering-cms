-- HRMS Phase 3, part 2: atomic employment events + payroll visibility.

-- ---------------------------------------------------------------------------
-- 1. One call = one transaction: the employee change AND its history row are saved together or not at all.
--    SECURITY INVOKER, so Row Level Security and table privileges of the caller still apply.
-- ---------------------------------------------------------------------------
create or replace function public.hr_record_employment_event(
  p_employee_id uuid,
  p_event text,
  p_effective date,
  p_outcome text default null,
  p_details text default null,
  p_to_status text default null,
  p_new_probation_end date default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  e public.employees%rowtype;
  new_status text;
begin
  select * into e from public.employees where id = p_employee_id for update;
  if not found then raise exception 'Employee not found.'; end if;
  if not public.user_is_hr_admin(e.company_id) then raise exception 'Only HR can record employment events.'; end if;
  if p_effective is null then raise exception 'An effective date is required.'; end if;
  if e.status in ('resigned', 'terminated') and p_event <> 'status_change' then
    raise exception 'This employee has already left the company.';
  end if;

  if p_event = 'confirmation' then
    if e.employment_stage is distinct from 'probation' then raise exception 'Only an employee on probation can be confirmed.'; end if;
    update public.employees set employment_stage = 'confirmed', confirmation_date = p_effective where id = p_employee_id;
    insert into public.employment_history (company_id, employee_id, event_type, effective_date, from_status, to_status, details, recorded_by)
    values (e.company_id, e.id, 'confirmation', p_effective, 'probation', 'confirmed', p_details, auth.uid());

  elsif p_event = 'probation_review' then
    if e.employment_stage is distinct from 'probation' then raise exception 'Probation reviews apply to employees on probation only.'; end if;
    if p_outcome is null or p_outcome not in ('pass', 'extend', 'fail') then raise exception 'Choose a review outcome.'; end if;
    if p_outcome = 'extend' then
      if p_new_probation_end is null or (e.probation_end is not null and p_new_probation_end <= e.probation_end) then
        raise exception 'Provide a probation end date later than the current one to extend.';
      end if;
      update public.employees set probation_end = p_new_probation_end where id = p_employee_id;
    end if;
    insert into public.employment_history (company_id, employee_id, event_type, effective_date, outcome, details, recorded_by)
    values (e.company_id, e.id, 'probation_review', p_effective, p_outcome, p_details, auth.uid());

  elsif p_event in ('resignation', 'termination') then
    if p_event = 'termination' and coalesce(trim(p_details), '') = '' then raise exception 'A reason is required to record a termination.'; end if;
    new_status := case p_event when 'resignation' then 'resigned' else 'terminated' end;
    update public.employees set status = new_status, resign_date = p_effective where id = p_employee_id;
    insert into public.employment_history (company_id, employee_id, event_type, effective_date, from_status, to_status, details, recorded_by)
    values (e.company_id, e.id, p_event, p_effective, e.status, new_status, p_details, auth.uid());

  elsif p_event = 'status_change' then
    if p_to_status is null or p_to_status not in ('active', 'inactive') then raise exception 'Status can only be set to active or inactive here.'; end if;
    if p_to_status = e.status then raise exception 'The employee already has that status.'; end if;
    if coalesce(trim(p_details), '') = '' then raise exception 'A reason is required for a status change.'; end if;
    update public.employees
      set status = p_to_status, resign_date = case when p_to_status = 'active' then null else resign_date end
      where id = p_employee_id;
    insert into public.employment_history (company_id, employee_id, event_type, effective_date, from_status, to_status, details, recorded_by)
    values (e.company_id, e.id, 'status_change', p_effective, e.status, p_to_status, p_details, auth.uid());

  else
    raise exception 'Unknown employment event.';
  end if;
end;
$$;

revoke execute on function public.hr_record_employment_event(uuid, text, date, text, text, text, date) from public, anon;
grant execute on function public.hr_record_employment_event(uuid, text, date, text, text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Payroll: HR Admins and Finance read; HR Admins write; an employee sees only their own PAID records.
--    (Previously any user with the HR module could read and edit every salary record in the company.)
-- ---------------------------------------------------------------------------
drop policy payroll_records_all on payroll_records;
create policy payroll_records_select on payroll_records for select to authenticated using (
  public.user_is_hr_admin(company_id) or public.user_is_finance(company_id)
  or (status = 'paid' and public.user_owns_employee(employee_id))
);
create policy payroll_records_insert on payroll_records for insert to authenticated with check (public.user_is_hr_admin(company_id));
create policy payroll_records_update on payroll_records for update to authenticated using (public.user_is_hr_admin(company_id)) with check (public.user_is_hr_admin(company_id));
create policy payroll_records_delete on payroll_records for delete to authenticated using (public.user_is_hr_admin(company_id));
