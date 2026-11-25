-- Every staff member's OT and leave is approved by their own superior (list "LIST APPROVAL STAFF BY WHO", Nov 2026).
-- The superior is a login (one person can have a staff record in several companies), kept on every company record of the staff.
-- A Super Admin (Madam Penny, Ms. Nabilah) can still decide when the superior is away. Staff without a superior keep the
-- approvers used before: the OT approvers (ot_approvers) for OT and the leave approvers (leave_approvers) for leave.

alter table public.employees add column if not exists superior_user_id uuid references auth.users(id) on delete set null;
comment on column public.employees.superior_user_id is 'The login of the superior who approves this staff member''s OT and leave.';
create index if not exists employees_superior_user_id_idx on public.employees(superior_user_id);

alter table public.leave_requests add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.leave_requests add column if not exists reviewed_at timestamptz;
alter table public.leave_requests add column if not exists decision_remarks text;

-- the name shown for a superior: the name on their staff record
create or replace function public.superior_display_name(target_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.full_name from public.employees e where e.user_id = target_user_id order by (e.status = 'active') desc, e.created_at limit 1),
    (select p.full_name from public.profiles p where p.id = target_user_id)
  );
$$;

-- the superior of each of the given staff records (only records the caller may see: their own, their company's, or their own team)
create or replace function public.employee_superiors(target_employee_ids uuid[])
returns table(employee_id uuid, superior_user_id uuid, superior_name text)
language sql stable security definer set search_path = public as $$
  select e.id, e.superior_user_id, public.superior_display_name(e.superior_user_id)
  from public.employees e
  where e.id = any(target_employee_ids)
    and e.superior_user_id is not null
    and (e.user_id = auth.uid() or e.superior_user_id = auth.uid() or e.company_id in (select public.user_company_ids()) or public.current_user_is_super_admin());
$$;

-- the names of the people who decided (for "Approved by ..." on the lists)
create or replace function public.user_display_names(target_user_ids uuid[])
returns table(user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select u.id, public.superior_display_name(u.id) from unnest(target_user_ids) as u(id) where auth.uid() is not null;
$$;

create or replace function public.user_is_superior_of(target_employee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees e where e.id = target_employee_id and e.superior_user_id = auth.uid());
$$;

create or replace function public.user_is_superior_anywhere()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees e where e.superior_user_id = auth.uid());
$$;

-- who may approve / reject the OT ('ot') or leave ('leave') of this staff member
create or replace function public.user_can_decide_staff_request(target_employee_id uuid, request_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when e.superior_user_id is not null then e.superior_user_id = auth.uid() or public.current_user_is_super_admin()
      when request_kind = 'ot' then exists (select 1 from public.ot_approvers where user_id = auth.uid())
      else exists (select 1 from public.leave_approvers where user_id = auth.uid())
    end
    from public.employees e where e.id = target_employee_id
  ), false);
$$;

-- the message shown to someone who may not decide
create or replace function public.staff_request_approver_text(target_employee_id uuid, request_kind text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when e.superior_user_id is not null then 'Only ' || coalesce(public.superior_display_name(e.superior_user_id), 'the superior') || ' (the superior of this staff) or a Super Admin can approve or reject this.'
    when request_kind = 'ot' then 'Only Saiful, Redza, Atiq or Ismaizal can approve or reject overtime.'
    else 'Only Madam Penny can approve or reject leave.'
  end
  from public.employees e where e.id = target_employee_id;
$$;

grant execute on function public.superior_display_name(uuid) to authenticated;
grant execute on function public.employee_superiors(uuid[]) to authenticated;
grant execute on function public.user_is_superior_of(uuid) to authenticated;
grant execute on function public.user_display_names(uuid[]) to authenticated;
grant execute on function public.user_is_superior_anywhere() to authenticated;
grant execute on function public.user_can_decide_staff_request(uuid, text) to authenticated;
grant execute on function public.staff_request_approver_text(uuid, text) to authenticated;

-- the database checks: OT
create or replace function public.overtime_before_write()
returns trigger language plpgsql as $function$
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
    if public.user_owns_employee(new.employee_id) then
      raise exception 'You cannot approve or reject your own overtime.';
    end if;
    if not public.user_can_decide_staff_request(new.employee_id, 'ot') then
      raise exception '%', public.staff_request_approver_text(new.employee_id, 'ot');
    end if;
  end if;
  return new;
end;
$function$;

-- the database checks: leave
create or replace function public.leave_requests_guard_status()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null then return new; end if;
  if (tg_op = 'INSERT' and new.status in ('approved', 'rejected'))
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'rejected')) then
    if not public.user_can_decide_staff_request(new.employee_id, 'leave') then
      raise exception '%', public.staff_request_approver_text(new.employee_id, 'leave');
    end if;
  end if;
  return new;
end;
$function$;

-- the superior's list: every OT (except drafts) and every leave of their staff, waiting or decided
create or replace function public.my_team_requests()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'overtime', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'employee_id', o.employee_id, 'name', e.full_name, 'company', c.name, 'work_date', o.work_date,
        'start', o.ot_start_time, 'end', o.ot_end_time, 'hours', o.hours, 'reason', o.reason, 'status', o.status,
        'exceeds_limit', o.exceeds_limit, 'document_id', o.document_id, 'submitted_at', o.submitted_at,
        'approved_hours', o.approved_hours, 'remarks', o.manager_remarks, 'reviewed_at', o.reviewed_at, 'reviewed_by_name', public.superior_display_name(o.reviewed_by)
      ) order by o.work_date desc, e.full_name)
      from public.overtime_records o
      join public.employees e on e.id = o.employee_id
      join public.companies c on c.id = o.company_id
      where e.superior_user_id = auth.uid()
        and o.status <> 'draft'
    ), '[]'::jsonb),
    'leave', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'employee_id', l.employee_id, 'name', e.full_name, 'company', c.name, 'leave_type', l.leave_type,
        'leave_type_other', l.leave_type_other, 'start_date', l.start_date, 'end_date', l.end_date, 'days', l.days,
        'reason', l.reason, 'status', l.status, 'document_id', l.document_id, 'created_at', l.created_at,
        'remarks', l.decision_remarks, 'reviewed_at', l.reviewed_at, 'reviewed_by_name', public.superior_display_name(l.reviewed_by)
      ) order by l.start_date desc, e.full_name)
      from public.leave_requests l
      join public.employees e on e.id = l.employee_id
      join public.companies c on c.id = l.company_id
      where e.superior_user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.my_team_requests() to authenticated;

-- the decisions (the superior may not be an admin of the staff member's company, so these run with the checks above)
create or replace function public.decide_staff_overtime(p_overtime_id uuid, p_decision text, p_approved_hours numeric, p_remarks text)
returns void language plpgsql security definer set search_path = public as $$
declare
  rec public.overtime_records;
  v_hours numeric;
  v_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Choose Approve or Reject.'; end if;
  select * into rec from public.overtime_records where id = p_overtime_id for update;
  if not found then raise exception 'OT record not found.'; end if;
  if rec.status not in ('submitted', 'pending_approval') then raise exception 'This OT is not waiting for a decision.'; end if;
  if public.user_owns_employee(rec.employee_id) then raise exception 'You cannot approve or reject your own overtime.'; end if;
  if not public.user_can_decide_staff_request(rec.employee_id, 'ot') then
    raise exception '%', public.staff_request_approver_text(rec.employee_id, 'ot');
  end if;
  if p_decision = 'approved' then
    v_hours := coalesce(p_approved_hours, rec.hours);
    if v_hours <= 0 or v_hours > rec.hours then
      raise exception 'Approved hours must be more than 0 and not more than the % hours requested.', rec.hours;
    end if;
  else
    v_hours := null;
    if v_remarks is null then raise exception 'Enter a remark explaining why this OT is rejected.'; end if;
  end if;
  update public.overtime_records
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), approved_hours = v_hours, manager_remarks = v_remarks
    where id = rec.id;
  if rec.approval_id is not null then
    update public.approvals set status = p_decision, updated_at = now() where id = rec.approval_id;
  end if;
end;
$$;

create or replace function public.decide_staff_leave(p_leave_id uuid, p_decision text, p_remarks text)
returns void language plpgsql security definer set search_path = public as $$
declare
  rec public.leave_requests;
  v_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Choose Approve or Reject.'; end if;
  select * into rec from public.leave_requests where id = p_leave_id for update;
  if not found then raise exception 'This leave request was not found (it may have been deleted).'; end if;
  if rec.status <> 'pending' then raise exception 'This leave request is already decided.'; end if;
  if public.user_owns_employee(rec.employee_id) then raise exception 'You cannot approve or reject your own leave.'; end if;
  if not public.user_can_decide_staff_request(rec.employee_id, 'leave') then
    raise exception '%', public.staff_request_approver_text(rec.employee_id, 'leave');
  end if;
  update public.leave_requests
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), decision_remarks = v_remarks
    where id = rec.id;
  if rec.approval_id is not null then
    update public.approvals set status = p_decision, updated_at = now() where id = rec.approval_id;
  end if;
end;
$$;
grant execute on function public.decide_staff_overtime(uuid, text, numeric, text) to authenticated;
grant execute on function public.decide_staff_leave(uuid, text, text) to authenticated;
revoke execute on function public.decide_staff_overtime(uuid, text, numeric, text) from anon, public;
revoke execute on function public.decide_staff_leave(uuid, text, text) from anon, public;
revoke execute on function public.my_team_requests() from anon, public;
revoke execute on function public.employee_superiors(uuid[]) from anon, public;

-- the superiors from the list (matched on the name; the same person in several companies gets it on every record)
with list(staff_name, superior_name) as (values
  ('MUHAMMAD HAFIZI BIN MAMAT', 'CHAN PIT NYET'),
  ('MUHAMMAD FAKHRUL AKMAL BIN SALIM', 'CHAN PIT NYET'),
  ('ZAKY BIN YAHYA', 'CHAN PIT NYET'),
  ('MOHAMMAD MUGHNI BIN MOHD ADNAN', 'CHAN PIT NYET'),
  ('WIN THUT', 'CHAN PIT NYET'),
  ('SOE MOE KYAW', 'CHAN PIT NYET'),
  ('SAN SHWE MAUNG', 'CHAN PIT NYET'),
  ('AUNG THU KHAING', 'CHAN PIT NYET'),
  ('WAI YAN MOE', 'CHAN PIT NYET'),
  ('R .NURLELA', 'CHAN PIT NYET'),
  ('AYE KYAW SOE', 'CHAN PIT NYET'),
  ('ARKAR', 'CHAN PIT NYET'),
  ('NUR RASYIDAH NABILAH BINTI MOHD RASHIDI', 'CHAN PIT NYET'),
  ('KHAIRUL ADLAN BIN SAGIMAN', 'CHAN PIT NYET'),
  ('CHAN KUOK HAO', 'ISMAIZAL BIN MOHD ISMAIL'),
  ('MD NUR AZMI BIN MD SALLEH', 'ISMAIZAL BIN MOHD ISMAIL'),
  ('MOHD TAHIR BIN JAFFAR', 'ISMAIZAL BIN MOHD ISMAIL'),
  ('SAIFUL FADELI BIN AHMAD', 'ISMAIZAL BIN MOHD ISMAIL'),
  ('SYAZA SYAHIRAH BINTI MOHAMAD SAIRI', 'ISMAIZAL BIN MOHD ISMAIL'),
  ('NIK HANNAH AWANIS BINTI SUPIAN', 'ISMAIZAL BIN MOHD ISMAIL'),
  ('FADILAH BINTI RASHID', 'ISMAIZAL BIN MOHD ISMAIL'),
  ('MUHAMMAD ATIQUFARHAN BIN AB HAMID', 'ISMAIZAL BIN MOHD ISMAIL'),
  ('MOHD REDZA BIN MOHAMED JASMIN', 'ISMAIZAL BIN MOHD ISMAIL'),
  ('AUNG', 'MOHD TAHIR BIN JAFFAR'),
  ('MUSA BIN ABDULLAH', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('MOHD RAZIN BIN SAMSUDIN', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('SWAN KHANT PAING (KO T)', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('MYO SWEE OO (HUSIN)', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('PYAE THIHA NAING', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('BILLAL MD HOSSAIN', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('WAN SALLEH HOODIN BIN WAN MAHMOOD', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('KYAW HTOO (DOLLAH)', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('ZAY YAR KYAW (JOE)', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('HTIKE THU', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID'),
  ('THIHA NAING (THIHA)', 'MOHD REDZA BIN MOHAMED JASMIN'),
  ('TUN TUN WIN (RAMLI)', 'MOHD REDZA BIN MOHAMED JASMIN'),
  ('MUHAMMAD SYAMIE BIN SAIPULLAZIM', 'MOHD REDZA BIN MOHAMED JASMIN'),
  ('MUHAMMAD ZARIF BIN MOHD ASRI', 'MOHD REDZA BIN MOHAMED JASMIN'),
  ('MUHAMAD FADIL BIN AHMAD', 'MOHD REDZA BIN MOHAMED JASMIN'),
  ('MOHD ZAHIRUDDIN BIN GHAZALLI', 'NIK HANNAH AWANIS BINTI SUPIAN'),
  ('SHARUDIN BIN YUNUS', 'NIK HANNAH AWANIS BINTI SUPIAN')
), sup as (
  select l.staff_name, (select s.user_id from public.employees s where upper(btrim(s.full_name)) = l.superior_name and s.user_id is not null limit 1) as superior_user_id
  from list l
)
update public.employees e
   set superior_user_id = sup.superior_user_id
  from sup
 where upper(btrim(e.full_name)) = sup.staff_name
   and sup.superior_user_id is not null;
