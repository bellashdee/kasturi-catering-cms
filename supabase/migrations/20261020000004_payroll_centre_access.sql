-- Payroll is private and confidential: only the Director of Finance (Ms. Penny Chan) and her personal assistant (Ms. Nabilah) may
-- view or change payroll records. Everybody else (also other Super Admins and Company Admins) is blocked by the database itself.
create table if not exists public.payroll_centre_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.payroll_centre_access enable row level security;

drop policy if exists payroll_centre_access_own on public.payroll_centre_access;
create policy payroll_centre_access_own on public.payroll_centre_access for select to authenticated using (user_id = auth.uid());

create or replace function public.user_can_use_payroll_centre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payroll_centre_access where user_id = auth.uid());
$$;
grant execute on function public.user_can_use_payroll_centre() to authenticated;

insert into public.payroll_centre_access (user_id, note)
select id, note from (values
  ('2e6cc396-a0f7-406b-82ad-bc1241c33ef0'::uuid, 'Ms. Penny Chan - Director of Finance'),
  ('296343b8-f5a1-4226-9d0c-41c75c99bf2a'::uuid, 'Ms. Nabilah - PA to the Director of Finance')
) as v(id, note)
where exists (select 1 from auth.users u where u.id = v.id)
on conflict (user_id) do nothing;

-- restrictive: it is ANDed with the existing company / module policies, so nobody else can read or write payroll records
drop policy if exists payroll_records_finance_director_only on public.payroll_records;
create policy payroll_records_finance_director_only on public.payroll_records as restrictive for all to authenticated
  using (public.user_can_use_payroll_centre()) with check (public.user_can_use_payroll_centre());
