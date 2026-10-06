-- External delivery services (e.g. Lalamove). Not staff: never appear in attendance and never clock in/out.
create table delivery_vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index delivery_vendors_company_name_key on delivery_vendors(company_id, lower(name));
create index delivery_vendors_company_idx on delivery_vendors(company_id);

alter table delivery_vendors enable row level security;
create policy delivery_vendors_all on delivery_vendors for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));

-- A delivery is carried out either by an internal driver (driver_id) or by an external vendor, never both.
alter table deliveries add column delivery_vendor_id uuid references delivery_vendors(id) on delete set null;
alter table deliveries add constraint deliveries_single_assignee check (driver_id is null or delivery_vendor_id is null);
