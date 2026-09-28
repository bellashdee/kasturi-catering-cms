-- Vehicles: extend the Phase 1 skeleton with the fields Driver & Logistics needs
alter table vehicles
  add column vehicle_type text,
  add column insurance_expiry date,
  add column road_tax_expiry date,
  add constraint vehicles_status_check check (status in ('active', 'maintenance', 'inactive', 'retired'));

-- Deliveries: extend the Phase 1 skeleton (already gets vehicle_id/driver_id/notes from Catering)
alter table deliveries
  add column location text,
  add column items_description text,
  add constraint deliveries_status_check check (status in ('scheduled', 'in_transit', 'delivered', 'cancelled'));

-- Drivers are HR employees — this table only holds the driver-specific extras,
-- so a driver's name/company/contact stay owned by `employees` (no duplication).
create table driver_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null unique references employees(id) on delete cascade,
  license_number text,
  license_expiry date,
  availability_status text not null default 'available' check (availability_status in ('available', 'on_delivery', 'off_duty', 'on_leave')),
  notes text,
  created_at timestamptz not null default now()
);

-- Vehicle service history. Adding a record also updates vehicles.next_maintenance_due
-- (the single value the dashboard's "due soon" alert already reads) so that figure
-- and this log can never drift apart — same choke-point pattern as Kitchen's stock ledger.
create table vehicle_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  service_date date not null,
  next_service_date date,
  cost numeric(12, 2) not null default 0,
  notes text,
  document_id uuid references documents(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Mileage / fuel / toll / parking / other running costs. A dedicated table (like
-- marketing_expenses) rather than the generic `expenses` table, since these need to
-- link back to a vehicle/driver/delivery — Finance reads its total via getFinancialOverview.
create table driver_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  delivery_id uuid references deliveries(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  driver_id uuid references employees(id) on delete set null,
  category text not null check (category in ('mileage', 'fuel', 'toll', 'parking', 'other')),
  distance_km numeric(10, 2),
  amount numeric(12, 2) not null,
  expense_date date not null,
  notes text,
  document_id uuid references documents(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
