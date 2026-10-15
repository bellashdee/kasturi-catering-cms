-- Event clock in / clock out of delivery drivers and part-time staff from IA MyStaff (the agency).
-- They have no login: the public form (/event-clock/<company>) writes with the server key, after checking that the phone is within
-- 100 m of the event location. Additive only.

-- Where an event location is on the map. The first time a location is used it is looked up once and kept here;
-- an admin can correct the pin (source 'admin').
create table public.event_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  location_key text not null,
  location_text text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  source text not null default 'geocoded' check (source in ('geocoded', 'admin')),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, location_key)
);
create trigger event_sites_set_updated_at before update on public.event_sites
  for each row execute function public.set_updated_at();
alter table public.event_sites enable row level security;
create policy event_sites_select on public.event_sites for select using (public.user_has_module(company_id, 'driver-logistics'));
create policy event_sites_insert on public.event_sites for insert with check (public.user_is_company_admin(company_id));
create policy event_sites_update on public.event_sites for update using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));

create table public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  staff_type text not null check (staff_type in ('driver', 'ia_mystaff')),
  /** driver_profiles.id for a driver, the IC digits for an IA MyStaff part-timer: one person = one key. */
  staff_key text not null,
  driver_profile_id uuid references public.driver_profiles(id),
  person_name text not null check (length(btrim(person_name)) > 0),
  ic_number text check (ic_number is null or ic_number ~ '^\d{6}-\d{2}-\d{4}$'),
  event_id uuid references public.catering_events(id),
  event_name text not null check (length(btrim(event_name)) > 0),
  event_key text not null,
  event_location text not null check (length(btrim(event_location)) > 0),
  site_id uuid references public.event_sites(id),
  attendance_date date not null,
  clock_in_time timestamptz,
  clock_in_latitude double precision,
  clock_in_longitude double precision,
  clock_in_distance_m numeric(10, 1),
  /** 'verified' = within 100 m of the event location; 'unverified' = the location could not be found on the map. */
  clock_in_check text check (clock_in_check in ('verified', 'unverified')),
  clock_out_time timestamptz,
  clock_out_latitude double precision,
  clock_out_longitude double precision,
  clock_out_distance_m numeric(10, 1),
  clock_out_check text check (clock_out_check in ('verified', 'unverified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((staff_type = 'ia_mystaff') = (ic_number is not null)),
  check (clock_out_time is null or clock_in_time is not null),
  unique (company_id, staff_type, staff_key, event_key, attendance_date)
);
create index event_attendance_company_date_idx on public.event_attendance (company_id, attendance_date desc);
create trigger event_attendance_set_updated_at before update on public.event_attendance
  for each row execute function public.set_updated_at();
alter table public.event_attendance enable row level security;
-- people who run operations see the records; only admins may correct them
create policy event_attendance_select on public.event_attendance for select using (public.user_has_module(company_id, 'driver-logistics'));
create policy event_attendance_update on public.event_attendance for update using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));
