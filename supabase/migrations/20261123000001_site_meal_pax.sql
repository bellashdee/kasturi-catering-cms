-- Meals & Pax tracker: how many people were served each meal, per site, per day.
-- Replaces the Excel "Meals Pax Tracker" files kept by Signature Solution (JDT 2/3/4, UTM).
-- Already applied to the live database by hand; written to be safe to run again.

create table if not exists public.site_meal_pax (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  site          text not null,
  pax_date      date not null,
  breakfast_pax integer check (breakfast_pax is null or breakfast_pax >= 0),
  lunch_pax     integer check (lunch_pax is null or lunch_pax >= 0),
  dinner_pax    integer check (dinner_pax is null or dinner_pax >= 0),
  hitea_pax     integer check (hitea_pax is null or hitea_pax >= 0),
  remarks       text,
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, site, pax_date)
);

alter table public.site_meal_pax enable row level security;

drop policy if exists site_meal_pax_select on public.site_meal_pax;
create policy site_meal_pax_select on public.site_meal_pax
  for select using (company_id in (select user_company_ids()));

drop policy if exists site_meal_pax_insert on public.site_meal_pax;
create policy site_meal_pax_insert on public.site_meal_pax
  for insert with check (company_id in (select user_company_ids()));

drop policy if exists site_meal_pax_update on public.site_meal_pax;
create policy site_meal_pax_update on public.site_meal_pax
  for update using (company_id in (select user_company_ids()))
  with check (company_id in (select user_company_ids()));

drop policy if exists site_meal_pax_delete on public.site_meal_pax;
create policy site_meal_pax_delete on public.site_meal_pax
  for delete using (company_id in (select user_company_ids()));

drop trigger if exists site_meal_pax_set_updated_at on public.site_meal_pax;
create trigger site_meal_pax_set_updated_at
  before update on public.site_meal_pax
  for each row execute function set_updated_at();
