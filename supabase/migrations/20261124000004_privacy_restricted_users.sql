-- Admins who run the company but must not see the staff's private matters: other staff's personal details (IC, address, family,
-- emergency contact, bank / EPF / tax numbers), salary and payslips, and personal letters (LOA, confirmation, offer, contract,
-- warnings, show cause, appraisal, MC). Their own record stays open to them. Payroll is already limited to the Payroll Centre people.
create table if not exists public.privacy_restricted_users (
  user_id uuid primary key references profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.privacy_restricted_users enable row level security;
drop policy if exists privacy_restricted_users_read on public.privacy_restricted_users;
create policy privacy_restricted_users_read on public.privacy_restricted_users for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_super_admin());
drop policy if exists privacy_restricted_users_write on public.privacy_restricted_users;
create policy privacy_restricted_users_write on public.privacy_restricted_users for all to authenticated
  using (public.current_user_is_super_admin()) with check (public.current_user_is_super_admin());

create or replace function public.user_privacy_restricted()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.privacy_restricted_users where user_id = auth.uid());
$$;
grant execute on function public.user_privacy_restricted() to authenticated;

-- bank / EPF / SOCSO / tax numbers of other staff
drop policy if exists employee_private_details_privacy on public.employee_private_details;
create policy employee_private_details_privacy on public.employee_private_details as restrictive for all to authenticated
  using (not public.user_privacy_restricted() or public.user_owns_employee(employee_id))
  with check (not public.user_privacy_restricted() or public.user_owns_employee(employee_id));

-- personal letters and MCs of other staff (certificates such as food handling, typhoid, work permit and training stay visible)
drop policy if exists employee_certificates_privacy on public.employee_certificates;
create policy employee_certificates_privacy on public.employee_certificates as restrictive for all to authenticated
  using (
    not public.user_privacy_restricted() or public.user_owns_employee(employee_id)
    or cert_type not in ('medical_certificate', 'confirmation_letter', 'loa', 'offer_letter', 'probation_extension_letter', 'warning_letter', 'show_cause_letter', 'contract', 'appraisal')
  )
  with check (
    not public.user_privacy_restricted() or public.user_owns_employee(employee_id)
    or cert_type not in ('medical_certificate', 'confirmation_letter', 'loa', 'offer_letter', 'probation_extension_letter', 'warning_letter', 'show_cause_letter', 'contract', 'appraisal')
  );

-- salary and payslips (on top of the Payroll Centre rule)
drop policy if exists payroll_records_privacy on public.payroll_records;
create policy payroll_records_privacy on public.payroll_records as restrictive for all to authenticated
  using (not public.user_privacy_restricted()) with check (not public.user_privacy_restricted());

-- the history of changes to staff records (it holds old personal details)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'employee_edit_history') then
    execute 'drop policy if exists employee_edit_history_privacy on public.employee_edit_history';
    execute 'create policy employee_edit_history_privacy on public.employee_edit_history as restrictive for select to authenticated using (not public.user_privacy_restricted() or public.user_owns_employee(employee_id))';
  end if;
end $$;

-- Ms. Syaza: every module of her companies, without the staff's private matters
insert into public.privacy_restricted_users (user_id, note)
values ('e490846b-2368-4cc3-bb77-8f6365691153', 'Full access except other staff''s private details, salary, payslips and personal letters')
on conflict (user_id) do nothing;
update public.user_company_access set allowed_modules = null, allowed_sections = null where user_id = 'e490846b-2368-4cc3-bb77-8f6365691153';
