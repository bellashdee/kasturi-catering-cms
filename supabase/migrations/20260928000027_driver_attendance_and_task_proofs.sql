-- Configured schedule per driver, used to derive "Late" attendance status.
alter table driver_profiles
  add column if not exists expected_clock_in_time time not null default '08:00:00';

-- Daily attendance record per driver, one row per driver per day.
create table if not exists driver_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  driver_id uuid not null references employees(id) on delete cascade,
  attendance_date date not null,
  clock_in_time timestamptz,
  clock_in_document_id uuid references documents(id) on delete set null,
  clock_in_remarks text,
  clock_out_time timestamptz,
  clock_out_document_id uuid references documents(id) on delete set null,
  clock_out_remarks text,
  is_off_day boolean not null default false,
  is_corrected boolean not null default false,
  correction_reason text,
  corrected_by uuid references auth.users(id) on delete set null,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (driver_id, attendance_date)
);

create index if not exists driver_attendance_company_idx on driver_attendance(company_id);
create index if not exists driver_attendance_driver_idx on driver_attendance(driver_id);
create index if not exists driver_attendance_date_idx on driver_attendance(attendance_date);

alter table driver_attendance enable row level security;
create policy driver_attendance_select on driver_attendance for select using (user_has_company_access(company_id));
create policy driver_attendance_insert on driver_attendance for insert with check (user_has_company_access(company_id));
create policy driver_attendance_update on driver_attendance for update using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));

-- Generic, module-agnostic proof-of-work attachments. Any module can attach
-- proof to any of its own records via (related_table, related_id) without a
-- new table per module — Driver today, Kitchen/Catering/Maintenance later.
create table if not exists task_proofs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  related_table text not null,
  related_id uuid not null,
  document_id uuid not null references documents(id) on delete cascade,
  proof_type text not null default 'other',
  remarks text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists task_proofs_related_idx on task_proofs(related_table, related_id);

alter table task_proofs enable row level security;
create policy task_proofs_select on task_proofs for select using (user_has_company_access(company_id));
create policy task_proofs_insert on task_proofs for insert with check (user_has_company_access(company_id));
create policy task_proofs_delete on task_proofs for delete using (user_has_company_access(company_id));

-- Generic, module-agnostic audit trail for status/proof changes and admin
-- overrides. Used by Driver attendance + deliveries now; reusable later.
create table if not exists task_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  related_table text not null,
  related_id uuid not null,
  action text not null,
  performed_by uuid references auth.users(id) on delete set null,
  previous_value text,
  new_value text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists task_audit_log_related_idx on task_audit_log(related_table, related_id);

alter table task_audit_log enable row level security;
create policy task_audit_log_select on task_audit_log for select using (user_has_company_access(company_id));
create policy task_audit_log_insert on task_audit_log for insert with check (user_has_company_access(company_id));

-- Deliveries: proof-of-delivery gate on top of the existing status column.
alter table deliveries
  add column if not exists proof_status text not null default 'no_proof' check (proof_status in ('no_proof','proof_uploaded','requires_review','completed')),
  add column if not exists completion_remarks text,
  add column if not exists completed_at timestamptz,
  add column if not exists admin_override boolean not null default false,
  add column if not exists admin_override_by uuid references auth.users(id) on delete set null,
  add column if not exists admin_override_reason text;
