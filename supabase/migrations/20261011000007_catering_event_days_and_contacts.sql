-- Multi-day catering events (3-5 days): one event / one quotation, with one row per day (date, set-up time, event time,
-- meal type, service type + pax, menu details, price per pax, remarks). Plus the event-level details a quotation needs:
-- set-up time, PIC name and contact number, sales agent, kitchen set-up, catering set-up, and price per pax (single-day).
-- All new columns are optional, so existing events and screens are unaffected.
alter table catering_events
  add column end_date date,
  add column setup_time time,
  add column pic_name text,
  add column pic_phone text,
  add column sales_agent text,
  add column kitchen_setup text,
  add column catering_setup text,
  add column price_per_pax numeric(12, 2) check (price_per_pax is null or price_per_pax >= 0),
  add constraint catering_events_end_after_start check (end_date is null or end_date >= event_date);

create table catering_event_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  catering_event_id uuid not null references catering_events(id) on delete cascade,
  day_date date not null,
  setup_time time,
  event_time time,
  meal_types text[] not null default '{}'
    check (meal_types <@ array['breakfast', 'lunch', 'hi_tea', 'dinner']::text[]),
  service_type text not null
    check (service_type in ('pack_food', 'dome_set', 'buffet', 'pre_plated', 'hidang', 'buffet_pack')),
  service_pax integer not null check (service_pax > 0),
  second_service_type text
    check (second_service_type in ('pack_food', 'dome_set', 'buffet', 'pre_plated', 'hidang', 'buffet_pack')),
  second_service_pax integer check (second_service_pax is null or second_service_pax > 0),
  menu_details text,
  price_per_pax numeric(12, 2) check (price_per_pax is null or price_per_pax >= 0),
  remarks text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint catering_event_days_second_service_pair check ((second_service_type is null) = (second_service_pax is null)),
  constraint catering_event_days_second_service_differs check (second_service_type is null or second_service_type <> service_type),
  constraint catering_event_days_one_per_date unique (catering_event_id, day_date)
);
create index catering_event_days_event_idx on catering_event_days (catering_event_id, day_date);

alter table catering_event_days enable row level security;
create policy "catering_event_days_select" on catering_event_days for select to authenticated
  using (public.user_has_company_access(company_id));
create policy "catering_event_days_insert" on catering_event_days for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "catering_event_days_update" on catering_event_days for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
create policy "catering_event_days_delete" on catering_event_days for delete to authenticated
  using (public.user_has_company_access(company_id));

-- a day must belong to the same company as its event (same check the event P&L entries use)
create trigger catering_event_days_company_check before insert or update on catering_event_days
  for each row execute function event_pnl_entry_company_check();
