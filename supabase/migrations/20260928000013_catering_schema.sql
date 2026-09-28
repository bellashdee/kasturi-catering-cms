alter table catering_events
  add column customer_id uuid references customers(id) on delete set null,
  add column event_time time,
  add column location text,
  add column event_type text not null default 'other' check (event_type in ('wedding','corporate','birthday','funeral','other')),
  add column menu_description text,
  add column special_requirements text;

alter table deliveries
  add column vehicle_id uuid references vehicles(id) on delete set null,
  add column driver_id uuid references employees(id) on delete set null,
  add column notes text;

alter table customer_invoices
  add column catering_event_id uuid references catering_events(id) on delete set null,
  add column quotation_id uuid;

create table quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  catering_event_id uuid not null references catering_events(id) on delete cascade,
  quotation_number text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid')),
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table customer_invoices
  add constraint customer_invoices_quotation_id_fkey foreign key (quotation_id) references quotations(id) on delete set null;

create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  item_name text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null,
  discount_percent numeric(5,2) not null default 0,
  line_total numeric(12,2) not null,
  sort_order integer not null default 0
);

create table event_costing (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  catering_event_id uuid not null unique references catering_events(id) on delete cascade,
  food_cost numeric(12,2) not null default 0,
  ingredient_cost numeric(12,2) not null default 0,
  staff_cost numeric(12,2) not null default 0,
  transport_cost numeric(12,2) not null default 0,
  equipment_cost numeric(12,2) not null default 0,
  other_cost numeric(12,2) not null default 0,
  notes text,
  updated_at timestamptz not null default now()
);

create table equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  unit text,
  total_quantity numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table event_equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  catering_event_id uuid not null references catering_events(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  quantity_needed numeric(10,2) not null default 1,
  created_at timestamptz not null default now()
);

create table event_staff (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  catering_event_id uuid not null references catering_events(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  role text not null default 'other' check (role in ('kitchen','service','driver','other')),
  notes text,
  created_at timestamptz not null default now()
);
