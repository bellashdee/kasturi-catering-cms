-- Generic reusable upload/OCR pipeline table (used by HR now, other modules later)
create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  module text not null,
  related_table text,
  related_id uuid,
  file_type text not null check (file_type in ('pdf','excel','csv','photo','screenshot')),
  storage_path text not null,
  original_filename text not null,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','extracted','confirmed','failed','manual')),
  extracted_data jsonb,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz
);

-- Employee profile fields
alter table employees
  add column department text,
  add column employment_type text not null default 'full_time' check (employment_type in ('full_time','part_time','contract')),
  add column join_date date,
  add column resign_date date,
  add column ic_passport_no text,
  add column phone text,
  add column email text;

-- Staff documents / certificates
alter table employee_certificates
  add column cert_type text not null default 'other' check (cert_type in ('food_handling','typhoid','work_permit','training','other')),
  add column cert_number text,
  add column issued_date date,
  add column document_id uuid references documents(id) on delete set null;

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type text not null check (leave_type in ('annual','medical','emergency','unpaid','other')),
  start_date date not null,
  end_date date not null,
  days numeric(5,1) not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approval_id uuid references approvals(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table overtime_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  hours numeric(5,2) not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  check_in time,
  check_out time,
  status text not null default 'present' check (status in ('present','absent','late','on_leave')),
  notes text,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create table payroll_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  pay_period_start date not null,
  pay_period_end date not null,
  gross_pay numeric(12,2) not null,
  deductions numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null,
  status text not null default 'draft' check (status in ('draft','paid')),
  payslip_document_id uuid references documents(id) on delete set null,
  created_at timestamptz not null default now()
);
