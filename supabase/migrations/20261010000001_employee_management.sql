-- Employee Management (HRMS Phase 3). Additive only: new tables/columns/policies, nothing dropped or renamed.
-- Apply to a test project first. The IC number is moved out of `employees` in a SEPARATE later
-- migration (20261010000003_employee_ic_scrub.sql) once the new app code is live.

-- ---------------------------------------------------------------------------
-- 1. Roles. The user_role enum is untouched; hr_role adds HR Admin / Director / Finance per company.
--    company_admin and super_admin are treated as HR Admin.
-- ---------------------------------------------------------------------------
alter table user_company_access
  add column hr_role text check (hr_role in ('hr_admin', 'director', 'finance')),
  add column department_scope uuid[];

comment on column user_company_access.hr_role is 'Extra HRMS role for this company. company_admin/super_admin already count as HR Admin.';
comment on column user_company_access.department_scope is 'Departments a dept_manager may view. Direct reports (reporting_manager_id) are always included.';

-- ---------------------------------------------------------------------------
-- 2. Departments (replaces free-text employees.department; the text column is kept).
-- ---------------------------------------------------------------------------
create table departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index departments_company_name_key on departments (company_id, lower(name));
create index departments_company_idx on departments (company_id);

-- ---------------------------------------------------------------------------
-- 3. Employee fields. Probation/confirmed is a separate "stage" so existing screens that filter
--    status = 'active' (catering, drivers, finance, dashboards) keep including those people.
-- ---------------------------------------------------------------------------
alter table employees
  add column employee_no text,
  add column department_id uuid references departments(id) on delete set null,
  add column reporting_manager_id uuid references employees(id) on delete set null,
  add column employment_stage text check (employment_stage in ('probation', 'confirmed')),
  add column probation_start date,
  add column probation_end date,
  add column confirmation_date date,
  add column contract_end date,
  add column photo_path text;

alter table employees add constraint employees_status_check check (status in ('active', 'resigned', 'terminated', 'inactive'));
alter table employees add constraint employees_probation_dates_check check (probation_end is null or probation_start is null or probation_end >= probation_start);
alter table employees add constraint employees_not_own_manager_check check (reporting_manager_id is null or reporting_manager_id <> id);
create unique index employees_company_employee_no_key on employees (company_id, lower(employee_no)) where employee_no is not null;
create index employees_department_idx on employees (department_id);
create index employees_manager_idx on employees (reporting_manager_id);

-- Backfill departments from the existing free-text values, then link employees.
insert into departments (company_id, name)
select distinct e.company_id, trim(e.department) from employees e
where e.department is not null and trim(e.department) <> ''
on conflict do nothing;

update employees e set department_id = d.id
from departments d
where d.company_id = e.company_id and lower(d.name) = lower(trim(e.department)) and e.department_id is null;

-- ---------------------------------------------------------------------------
-- 4. Restricted personal details: IC, address, emergency contact (bank/EPF already live here).
-- ---------------------------------------------------------------------------
alter table employee_private_details
  add column ic_passport_no text,
  add column residential_address text,
  add column emergency_contact_name text,
  add column emergency_contact_relationship text,
  add column emergency_contact_phone text;

-- Copy only. The original employees.ic_passport_no is cleared by the later scrub migration.
insert into employee_private_details (employee_id, company_id, ic_passport_no)
select id, company_id, ic_passport_no from employees where ic_passport_no is not null
on conflict (employee_id) do update set ic_passport_no = excluded.ic_passport_no where employee_private_details.ic_passport_no is null;

-- ---------------------------------------------------------------------------
-- 5. History, documents and audit tables.
-- ---------------------------------------------------------------------------
create table employment_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  event_type text not null check (event_type in ('joined', 'status_change', 'probation_review', 'confirmation', 'resignation', 'termination', 'transfer', 'note')),
  effective_date date not null default current_date,
  from_status text,
  to_status text,
  outcome text check (outcome in ('pass', 'extend', 'fail')),
  details text,
  recorded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index employment_history_employee_idx on employment_history (employee_id, effective_date desc);

create table employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  category text not null check (category in ('offer_letter', 'employment_contract', 'confirmation_letter', 'warning_letter', 'resignation_letter', 'other')),
  title text not null,
  storage_path text not null unique,
  original_filename text not null,
  visible_to_employee boolean not null default true,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index employee_documents_employee_idx on employee_documents (employee_id);

-- Append-only record of who changed what. Stores column NAMES only, never values (no personal data in logs).
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  changed_fields text[],
  created_at timestamptz not null default now()
);
create index audit_log_company_time_idx on audit_log (company_id, created_at desc);
create index audit_log_record_idx on audit_log (table_name, record_id);

-- ---------------------------------------------------------------------------
-- 6. Helper functions (never executable by anon).
-- ---------------------------------------------------------------------------
create or replace function public.user_is_hr_admin(target_company_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and (
        (uca.role in ('super_admin', 'company_admin') and (uca.company_id = target_company_id or uca.company_id is null))
        or (uca.hr_role = 'hr_admin' and uca.company_id = target_company_id)
      )
  );
$$;

create or replace function public.user_is_director(target_company_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.user_company_access uca
    where uca.user_id = auth.uid() and uca.hr_role = 'director' and uca.company_id = target_company_id);
$$;

create or replace function public.user_is_finance(target_company_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.user_company_access uca
    where uca.user_id = auth.uid() and uca.hr_role = 'finance' and uca.company_id = target_company_id);
$$;

-- A department manager sees people in their department scope and their direct reports, in their own company only.
create or replace function public.user_manages_employee(target_employee_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.employees e
    join public.user_company_access uca on uca.company_id = e.company_id
    where e.id = target_employee_id
      and uca.user_id = auth.uid()
      and uca.role = 'dept_manager'
      and (
        e.department_id = any (coalesce(uca.department_scope, '{}'::uuid[]))
        or exists (select 1 from public.employees m where m.id = e.reporting_manager_id and m.user_id = auth.uid())
      )
  );
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'user_is_hr_admin(uuid)', 'user_is_director(uuid)', 'user_is_finance(uuid)', 'user_manages_employee(uuid)',
    'user_has_company_access(uuid)', 'user_has_module(uuid, text)', 'user_is_company_admin(uuid)',
    'user_is_ot_manager(uuid)', 'user_owns_employee(uuid)', 'current_user_is_super_admin()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;

  -- Pin search_path on existing trigger functions flagged by the Supabase security advisor (only if they exist).
  foreach f in array array['overtime_before_write()', 'guard_login_link()', 'finance_touch_updated_at()'] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('alter function public.%s set search_path = public', f);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Audit trigger: records who/when/which columns for sensitive tables.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_json jsonb;
  old_json jsonb;
  src jsonb;
  changed text[];
begin
  new_json := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_json := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  src := coalesce(new_json, old_json);

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into changed
    from jsonb_each(new_json) n
    where old_json -> n.key is distinct from n.value and n.key <> 'updated_at';
    if changed = '{}' then return new; end if;
  end if;

  insert into public.audit_log (company_id, actor_id, action, table_name, record_id, changed_fields)
  values (
    nullif(src ->> 'company_id', '')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(nullif(src ->> 'id', ''), nullif(src ->> 'employee_id', ''))::uuid,
    changed
  );
  return coalesce(new, old);
end;
$$;
revoke execute on function public.audit_row_change() from public, anon, authenticated;

create trigger employees_audit after insert or update or delete on employees for each row execute function public.audit_row_change();
create trigger employee_private_details_audit after insert or update or delete on employee_private_details for each row execute function public.audit_row_change();
create trigger employment_history_audit after insert on employment_history for each row execute function public.audit_row_change();
create trigger employee_documents_audit after insert or delete on employee_documents for each row execute function public.audit_row_change();
create trigger departments_audit after insert or update or delete on departments for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 8. Row Level Security.
-- ---------------------------------------------------------------------------
alter table departments enable row level security;
alter table employment_history enable row level security;
alter table employee_documents enable row level security;
alter table audit_log enable row level security;
revoke all on departments, employment_history, employee_documents, audit_log from anon;

create policy departments_select on departments for select to authenticated using (public.user_has_company_access(company_id));
create policy departments_insert on departments for insert to authenticated with check (public.user_is_hr_admin(company_id));
create policy departments_update on departments for update to authenticated using (public.user_is_hr_admin(company_id)) with check (public.user_is_hr_admin(company_id));

create policy employment_history_select on employment_history for select to authenticated using (
  public.user_is_hr_admin(company_id) or public.user_is_director(company_id)
  or public.user_owns_employee(employee_id) or public.user_manages_employee(employee_id)
);
create policy employment_history_insert on employment_history for insert to authenticated with check (public.user_is_hr_admin(company_id));
create policy employment_history_module_gate on employment_history as restrictive for all to authenticated
  using (public.user_has_module(company_id, 'hr')) with check (public.user_has_module(company_id, 'hr'));

create policy employee_documents_select on employee_documents for select to authenticated using (
  public.user_is_hr_admin(company_id) or (visible_to_employee and public.user_owns_employee(employee_id))
);
create policy employee_documents_insert on employee_documents for insert to authenticated with check (public.user_is_hr_admin(company_id));
create policy employee_documents_update on employee_documents for update to authenticated using (public.user_is_hr_admin(company_id)) with check (public.user_is_hr_admin(company_id));
create policy employee_documents_delete on employee_documents for delete to authenticated using (public.user_is_hr_admin(company_id));
create policy employee_documents_module_gate on employee_documents as restrictive for all to authenticated
  using (public.user_has_module(company_id, 'hr')) with check (public.user_has_module(company_id, 'hr'));

create policy audit_log_select on audit_log for select to authenticated using (
  public.user_is_hr_admin(company_id) or public.current_user_is_super_admin()
);
-- No insert/update/delete policies: only the security-definer trigger can write.

-- employees: anyone with company access can still read the directory fields (other modules rely on it),
-- but only HR Admins can create or change employee records. IC/address/emergency live in employee_private_details.
drop policy employees_insert on employees;
drop policy employees_update on employees;
create policy employees_insert on employees for insert to authenticated with check (public.user_is_hr_admin(company_id));
create policy employees_update on employees for update to authenticated using (public.user_is_hr_admin(company_id)) with check (public.user_is_hr_admin(company_id));

-- employee_private_details: HR Admins manage; the employee may read their own row.
create policy employee_private_details_hr_all on employee_private_details for all to authenticated
  using (public.user_is_hr_admin(company_id)) with check (public.user_is_hr_admin(company_id));
create policy employee_private_details_own_select on employee_private_details for select to authenticated
  using (public.user_owns_employee(employee_id));

-- ---------------------------------------------------------------------------
-- 9. Private storage for HR letters and profile photos.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-documents', 'hr-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

-- Path layout: {company_id}/photos/{employee_id}.ext (company-wide readable) or {company_id}/docs/{uuid}.ext (HR + owner).
create policy hr_documents_select on storage.objects for select to authenticated using (
  bucket_id = 'hr-documents' and (
    ((storage.foldername(name))[2] = 'photos' and public.user_has_company_access(((storage.foldername(name))[1])::uuid))
    or public.user_is_hr_admin(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1 from public.employee_documents d
      where d.storage_path = storage.objects.name and d.visible_to_employee and public.user_owns_employee(d.employee_id)
    )
  )
);
create policy hr_documents_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'hr-documents' and public.user_is_hr_admin(((storage.foldername(name))[1])::uuid)
);
create policy hr_documents_update on storage.objects for update to authenticated using (
  bucket_id = 'hr-documents' and public.user_is_hr_admin(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id = 'hr-documents' and public.user_is_hr_admin(((storage.foldername(name))[1])::uuid)
);
create policy hr_documents_delete on storage.objects for delete to authenticated using (
  bucket_id = 'hr-documents' and public.user_is_hr_admin(((storage.foldername(name))[1])::uuid)
);
