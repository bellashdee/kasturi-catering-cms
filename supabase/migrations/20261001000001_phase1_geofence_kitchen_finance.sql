-- Phase 1 of the large feature update (see C:\Users\User\.claude\plans\cuddly-herding-parnas.md):
-- driver GPS geofence, Kitchen (production schedule menu-plan link, package
-- menu, purchase request workflow), Finance (customer invoice enrichment,
-- outstanding payment tracking). All additive — no table dropped, no
-- existing column renamed or removed.

-- ── Driver GPS geofence ──────────────────────────────────────────────────

alter table driver_profiles
  add column approved_latitude numeric(9,6),
  add column approved_longitude numeric(9,6);

alter table driver_attendance
  add column clock_in_latitude numeric(9,6),
  add column clock_in_longitude numeric(9,6),
  add column clock_in_distance_km numeric(6,2),
  add column clock_out_latitude numeric(9,6),
  add column clock_out_longitude numeric(9,6),
  add column clock_out_distance_km numeric(6,2);

-- ── Kitchen: Production Schedule → real menu-plan data ──────────────────

alter table production_orders
  add column menu_plan_dish_id uuid references menu_plan_dishes(id) on delete set null,
  add column assigned_staff text,
  add column prep_time_minutes integer;

-- Table has 0 rows today, so the status vocabulary can be redefined safely.
update production_orders set status = 'preparing' where status = 'in_progress';

-- ── Kitchen: Package Menu ────────────────────────────────────────────────

create table package_menus (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  price_per_pax numeric(12,2) not null default 0,
  minimum_pax integer not null default 1,
  included_items text,
  special_requirements text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table package_menu_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  package_menu_id uuid not null references package_menus(id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','hitea','coffee_break','other')),
  item_name text not null,
  sort_order integer not null default 0
);

create index package_menu_items_package_idx on package_menu_items(package_menu_id);
create index package_menus_company_idx on package_menus(company_id);

alter table catering_events
  add column package_menu_id uuid references package_menus(id) on delete set null;

alter table package_menus enable row level security;
alter table package_menu_items enable row level security;

create policy package_menus_all on package_menus for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));
create policy package_menu_items_all on package_menu_items for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));

-- ── Kitchen: Purchase Request workflow ───────────────────────────────────

alter table purchase_requests
  add column required_date date,
  add column document_id uuid references documents(id) on delete set null;

alter table purchase_requests drop constraint if exists purchase_requests_status_check;
update purchase_requests set status = 'draft' where status = 'pending';
update purchase_requests set status = 'completed' where status = 'received';
update purchase_requests set status = 'rejected' where status = 'cancelled';
alter table purchase_requests
  add constraint purchase_requests_status_check
  check (status in ('draft','pending_approval','approved','ordered','completed','rejected'));
alter table purchase_requests alter column status set default 'draft';

-- ── Kitchen: Stock/Ingredients ────────────────────────────────────────────

alter table ingredients
  add column category text;

-- ── Finance: Customer Invoice enrichment ─────────────────────────────────

alter table customer_invoices
  add column description text,
  add column tax_amount numeric(12,2) not null default 0,
  add column document_id uuid references documents(id) on delete set null;

alter table customer_payments
  add column payment_reference text,
  add column payment_remarks text,
  add column recorded_by uuid references profiles(id) on delete set null;

alter type invoice_status add value if not exists 'issued';
alter type invoice_status add value if not exists 'partially_paid';
