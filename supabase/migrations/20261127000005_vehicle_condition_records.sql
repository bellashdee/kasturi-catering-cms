-- Vehicle condition & maintenance records (like a "Vehicle Maintenance & Records" sheet): the vehicle's details, its maintenance
-- schedule, tyres, battery, annual checklist and notes; a fuel log; and more detail on each repair / service.
-- One van has a vehicle record per company (Kasturi, Signature, O2): its condition is kept once, by plate number, so every company sees the
-- same. Only additions.

create table if not exists public.vehicle_profiles (
  plate_number text primary key,
  make text,
  model text,
  year int check (year is null or year between 1950 and 2100),
  colour text,
  nickname text,
  chassis_no text,
  engine_no text,
  fuel_type text check (fuel_type is null or fuel_type in ('petrol', 'diesel', 'electric', 'hybrid')),
  odometer_km numeric check (odometer_km is null or odometer_km >= 0),
  odometer_date date,
  insurance_company text,
  policy_number text,
  -- [{ item, interval_km, interval_months, last_done_date, last_done_km, next_due_date, next_due_km, notes }]
  schedule jsonb not null default '[]'::jsonb,
  -- [{ position, brand, size, purchase_date, odometer_km, notes }]
  tyres jsonb not null default '[]'::jsonb,
  -- { brand, purchase_date, voltage, warranty, replacement_date, notes }
  battery jsonb not null default '{}'::jsonb,
  -- { "<check key>": "YYYY-MM-DD last checked" }
  annual_checklist jsonb not null default '{}'::jsonb,
  notes text,
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_fuel_logs (
  id uuid primary key default gen_random_uuid(),
  plate_number text not null,
  fill_date date not null,
  odometer_km numeric check (odometer_km is null or odometer_km >= 0),
  litres numeric check (litres is null or litres > 0),
  cost numeric check (cost is null or cost >= 0),
  station text,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists vehicle_fuel_logs_plate_idx on public.vehicle_fuel_logs (plate_number, fill_date desc);

-- the person may see / change a plate's records when they may see one of that plate's vehicle records
create or replace function public.user_can_see_plate(target_plate text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vehicles v where v.plate_number = target_plate and v.company_id in (select public.user_company_ids()));
$$;

alter table public.vehicle_profiles enable row level security;
alter table public.vehicle_fuel_logs enable row level security;
drop policy if exists vehicle_profiles_all on public.vehicle_profiles;
create policy vehicle_profiles_all on public.vehicle_profiles for all using (public.user_can_see_plate(plate_number)) with check (public.user_can_see_plate(plate_number));
drop policy if exists vehicle_fuel_logs_all on public.vehicle_fuel_logs;
create policy vehicle_fuel_logs_all on public.vehicle_fuel_logs for all using (public.user_can_see_plate(plate_number)) with check (public.user_can_see_plate(plate_number));

drop trigger if exists vehicle_profiles_set_updated_at on public.vehicle_profiles;
create trigger vehicle_profiles_set_updated_at before update on public.vehicle_profiles for each row execute function public.set_updated_at();

-- more detail on each repair / service
alter table public.vehicle_maintenance_records add column if not exists odometer_km numeric check (odometer_km is null or odometer_km >= 0);
alter table public.vehicle_maintenance_records add column if not exists service_type text;
alter table public.vehicle_maintenance_records add column if not exists workshop text;
