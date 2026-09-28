-- catering_events, deliveries, customer_invoices already have select policies (migration 004); add write access
create policy "catering_events_insert" on catering_events for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "catering_events_update" on catering_events for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

create policy "deliveries_insert" on deliveries for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "deliveries_update" on deliveries for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

create policy "customer_invoices_insert" on customer_invoices for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "customer_invoices_update" on customer_invoices for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- new tables
alter table quotations enable row level security;
create policy "quotations_all" on quotations for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table quotation_items enable row level security;
create policy "quotation_items_all" on quotation_items for all to authenticated
  using (exists (select 1 from quotations q where q.id = quotation_items.quotation_id and public.user_has_company_access(q.company_id)))
  with check (exists (select 1 from quotations q where q.id = quotation_items.quotation_id and public.user_has_company_access(q.company_id)));

alter table event_costing enable row level security;
create policy "event_costing_all" on event_costing for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table equipment enable row level security;
create policy "equipment_all" on equipment for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table event_equipment enable row level security;
create policy "event_equipment_all" on event_equipment for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table event_staff enable row level security;
create policy "event_staff_all" on event_staff for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- production_orders already select-only (migration 004); Catering now auto-creates these
create policy "production_orders_insert" on production_orders for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "production_orders_update" on production_orders for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
