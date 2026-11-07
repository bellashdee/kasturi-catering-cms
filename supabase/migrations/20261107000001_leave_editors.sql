-- Leave key-in: Ms. Syaza, Mr. Adlan and Ms. Nabilah can key in, see, change and delete the leave of the other staff of the companies they
-- can open (a paper form or a message from a staff member is typed in by them). They are NOT made Company Admins: HR private details, payroll
-- and approving leave stay with the admins. The Human Resources module gate still applies (the leave table has a restrictive hr-module policy).
create table if not exists public.leave_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.leave_editors enable row level security;
drop policy if exists leave_editors_own on public.leave_editors;
create policy leave_editors_own on public.leave_editors for select to authenticated using (user_id = auth.uid());

insert into public.leave_editors (user_id, note)
select v.id::uuid, v.note
from (values
  ('e490846b-2368-4cc3-bb77-8f6365691153', 'Ms. Syaza'),
  ('0cebe546-3d50-44e8-ab51-e23d2082e23d', 'Mr. Adlan'),
  ('296343b8-f5a1-4226-9d0c-41c75c99bf2a', 'Ms. Nabilah')
) as v(id, note)
where exists (select 1 from auth.users where id = v.id::uuid)
on conflict (user_id) do nothing;

create or replace function public.user_is_leave_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leave_editors where user_id = auth.uid());
$$;
revoke execute on function public.user_is_leave_editor() from public, anon;
grant execute on function public.user_is_leave_editor() to authenticated;

drop policy if exists leave_requests_all on public.leave_requests;
create policy leave_requests_all on public.leave_requests
  for all to authenticated
  using (
    company_id in (select public.user_admin_company_ids())
    or public.user_owns_employee(employee_id)
    or (public.user_is_leave_editor() and company_id in (select public.user_company_ids()))
  )
  with check (
    company_id in (select public.user_admin_company_ids())
    or public.user_owns_employee(employee_id)
    or (public.user_is_leave_editor() and company_id in (select public.user_company_ids()))
  );
