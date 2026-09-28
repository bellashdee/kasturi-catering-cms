-- vehicles and deliveries already have select policies; add write access
create policy "vehicles_insert" on vehicles for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "vehicles_update" on vehicles for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- deliveries already has insert/update from the Catering migration — no change needed

alter table driver_profiles enable row level security;
create policy "driver_profiles_all" on driver_profiles for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table vehicle_maintenance_records enable row level security;
create policy "vehicle_maintenance_records_all" on vehicle_maintenance_records for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table driver_expenses enable row level security;
create policy "driver_expenses_all" on driver_expenses for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
