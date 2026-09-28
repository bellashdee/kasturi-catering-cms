create type invoice_status as enum ('draft','pending_review','approved','paid','overdue','disputed');
create type event_status as enum ('enquiry','quoted','confirmed','in_production','delivered','completed','cancelled');

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  invoice_number text not null,
  invoice_date date not null,
  due_date date not null,
  amount numeric(12,2) not null,
  status invoice_status not null default 'pending_review',
  created_at timestamptz not null default now()
);

create table supplier_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  supplier_invoice_id uuid not null references supplier_invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_date date not null,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  created_at timestamptz not null default now()
);

create table customer_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  invoice_number text not null,
  invoice_date date not null,
  due_date date not null,
  amount numeric(12,2) not null,
  status invoice_status not null default 'pending_review',
  created_at timestamptz not null default now()
);

create table customer_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_invoice_id uuid not null references customer_invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_date date not null,
  created_at timestamptz not null default now()
);

create table catering_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  event_name text not null,
  event_date date not null,
  pax_count integer,
  status event_status not null default 'enquiry',
  total_amount numeric(12,2),
  created_at timestamptz not null default now()
);

create table production_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  catering_event_id uuid references catering_events(id) on delete cascade,
  planned_date date,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  catering_event_id uuid references catering_events(id) on delete cascade,
  scheduled_time timestamptz,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  full_name text not null,
  position text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table employee_certificates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  cert_name text not null,
  expiry_date date not null,
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  status text not null default 'planned',
  start_date date,
  end_date date,
  budget numeric(12,2),
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  module text not null,
  related_table text not null,
  related_id uuid not null,
  status text not null default 'pending',
  requested_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  unit_of_measure text,
  current_stock_qty numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plate_number text not null,
  next_maintenance_due date,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null,
  expense_date date not null,
  created_at timestamptz not null default now()
);
