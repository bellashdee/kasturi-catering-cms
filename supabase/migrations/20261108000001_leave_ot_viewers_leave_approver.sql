-- Who may look at the leave and the OT form of the staff, and who may approve leave.
--
-- Only nine people may see the leave and OT records of other staff: Mr. Ismaizal, Mr. Faidz, Ms. Penny, Ms. Nabilah, Ms. Syaza, Mr. Redza,
-- Mr. Atiq, Mr. Saiful and Adi (Mr. Mughni, O2 Life). Everybody else (the other managers, all the staff) sees only their own. Adi can look
-- but not change (can_edit = false). Within these, who may change a record stays as it was (the admins, and the OT approvers for OT).
-- Leave is approved or rejected by Madam Penny only: a database rule stops anybody else, whatever screen or route is used.

create table if not exists public.staff_leave_ot_viewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_edit boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
alter table public.staff_leave_ot_viewers enable row level security;
drop policy if exists staff_leave_ot_viewers_own on public.staff_leave_ot_viewers;
create policy staff_leave_ot_viewers_own on public.staff_leave_ot_viewers for select to authenticated using (user_id = auth.uid());

insert into public.staff_leave_ot_viewers (user_id, can_edit, note)
select v.id::uuid, v.can_edit, v.note
from (values
  ('88d03d77-a795-4a9e-bae7-b64290c384cd', true, 'Mr. Ismaizal'),
  ('2e4c967b-713c-4fad-b21c-9f2899d31e44', true, 'Mr. Faidz'),
  ('2e6cc396-a0f7-406b-82ad-bc1241c33ef0', true, 'Ms. Penny'),
  ('296343b8-f5a1-4226-9d0c-41c75c99bf2a', true, 'Ms. Nabilah'),
  ('e490846b-2368-4cc3-bb77-8f6365691153', true, 'Ms. Syaza'),
  ('264c2671-9e46-4ecc-8fab-494bc9703a13', true, 'Mr. Redza'),
  ('d08bc8b7-ddd8-4cad-8d90-8c33fe6dbb44', true, 'Mr. Atiq'),
  ('9f51fcc9-7c1b-4ca4-8f09-dc290d6f8a2d', true, 'Mr. Saiful'),
  ('8c2f8fef-6667-41a7-abd1-17f57cef68d3', false, 'Adi (Mr. Mughni): can look, cannot change')
) as v(id, can_edit, note)
where exists (select 1 from auth.users u where u.id = v.id::uuid)
on conflict (user_id) do update set can_edit = excluded.can_edit, note = excluded.note;

create or replace function public.user_is_staff_leave_ot_viewer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_leave_ot_viewers where user_id = auth.uid());
$$;
revoke execute on function public.user_is_staff_leave_ot_viewer() from public, anon;
grant execute on function public.user_is_staff_leave_ot_viewer() to authenticated;

-- OT: looking = the viewers (of the companies they can open); changing / deciding = the viewers who can edit
create or replace function public.user_is_ot_manager(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_leave_ot_viewers v
    join public.user_company_access uca on uca.user_id = v.user_id
    where v.user_id = auth.uid() and v.can_edit
      and (uca.company_id = target_company_id or uca.company_id is null)
  );
$$;

drop policy if exists overtime_records_select on public.overtime_records;
create policy overtime_records_select on public.overtime_records for select to authenticated
  using ((public.user_is_staff_leave_ot_viewer() and company_id in (select public.user_company_ids())) or public.user_owns_employee(employee_id));

-- leave: the viewers can look (the admins and the leave editors already could do more)
drop policy if exists leave_requests_viewers on public.leave_requests;
create policy leave_requests_viewers on public.leave_requests for select to authenticated
  using (public.user_is_staff_leave_ot_viewer() and company_id in (select public.user_company_ids()));

-- approving or rejecting leave: Madam Penny only
create table if not exists public.leave_approvers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.leave_approvers enable row level security;
drop policy if exists leave_approvers_own on public.leave_approvers;
create policy leave_approvers_own on public.leave_approvers for select to authenticated using (user_id = auth.uid());

insert into public.leave_approvers (user_id, note)
select '2e6cc396-a0f7-406b-82ad-bc1241c33ef0'::uuid, 'Ms. Penny'
where exists (select 1 from auth.users where id = '2e6cc396-a0f7-406b-82ad-bc1241c33ef0')
on conflict (user_id) do nothing;

create or replace function public.user_can_approve_leave()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leave_approvers where user_id = auth.uid());
$$;
revoke execute on function public.user_can_approve_leave() from public, anon;
grant execute on function public.user_can_approve_leave() to authenticated;

create or replace function public.leave_requests_guard_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- a server job, not a person
  if (tg_op = 'INSERT' and new.status in ('approved', 'rejected'))
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'rejected')) then
    if not exists (select 1 from public.leave_approvers where user_id = auth.uid()) then
      raise exception 'Only Madam Penny can approve or reject leave.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_requests_guard_status on public.leave_requests;
create trigger leave_requests_guard_status before insert or update on public.leave_requests for each row execute function public.leave_requests_guard_status();
