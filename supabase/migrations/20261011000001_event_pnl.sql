-- Monthly Event P&L (Signature Solution and Kasturi Indah): revenue and cost entries linked to the existing catering events.
-- Nothing is copied: events stay in catering_events, invoices stay in customer_invoices (an entry may point to one, once),
-- and the Catering "event costing" sheet (event_costing) is read as part of the event's direct costs.

-- 1. A readable reference for every event (EV-YYMM-NNN, unique per company)
alter table catering_events add column event_reference text;

create or replace function catering_events_set_reference() returns trigger language plpgsql as $$
declare
  n integer;
  candidate text;
begin
  if new.event_reference is not null and btrim(new.event_reference) <> '' then
    return new;
  end if;
  select count(*) + 1 into n from catering_events
    where company_id = new.company_id and to_char(event_date, 'YYMM') = to_char(new.event_date, 'YYMM');
  loop
    candidate := 'EV-' || to_char(new.event_date, 'YYMM') || '-' || lpad(n::text, 3, '0');
    exit when not exists (select 1 from catering_events where company_id = new.company_id and event_reference = candidate);
    n := n + 1;
  end loop;
  new.event_reference := candidate;
  return new;
end $$;

create trigger catering_events_set_reference before insert on catering_events
  for each row execute function catering_events_set_reference();

-- existing events get a reference too (oldest first, so numbers follow the order they were created)
do $$
declare r record; n integer; candidate text;
begin
  for r in select id, company_id, event_date from catering_events where event_reference is null order by created_at loop
    select count(*) + 1 into n from catering_events
      where company_id = r.company_id and event_reference like 'EV-' || to_char(r.event_date, 'YYMM') || '-%';
    loop
      candidate := 'EV-' || to_char(r.event_date, 'YYMM') || '-' || lpad(n::text, 3, '0');
      exit when not exists (select 1 from catering_events where company_id = r.company_id and event_reference = candidate);
      n := n + 1;
    end loop;
    update catering_events set event_reference = candidate where id = r.id;
  end loop;
end $$;

create unique index catering_events_reference_key on catering_events (company_id, event_reference);

-- 2. Revenue entries (sales, packages, extra services, other revenue; less discounts, refunds, credit notes)
create table event_revenue_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  catering_event_id uuid not null references catering_events(id),
  entry_type text not null check (entry_type in ('sales', 'package', 'additional_service', 'other_revenue', 'discount', 'refund', 'credit_note')),
  description text,
  amount numeric(14, 2) not null check (amount > 0),
  entry_date date not null,
  customer_invoice_id uuid references customer_invoices(id),
  document_id uuid references documents(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index event_revenue_entries_event_idx on event_revenue_entries (catering_event_id);
create index event_revenue_entries_company_idx on event_revenue_entries (company_id);
-- an invoice can become revenue only once, so it can never be counted twice
create unique index event_revenue_entries_invoice_key on event_revenue_entries (customer_invoice_id) where customer_invoice_id is not null;

-- 3. Cost entries: direct costs and additional event-specific expenses
create table event_cost_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  catering_event_id uuid not null references catering_events(id),
  cost_class text not null check (cost_class in ('direct', 'additional')),
  cost_type text not null check (cost_type in (
    'food_ingredients', 'meat_seafood_vegetables', 'packaging', 'labour_overtime', 'transport_delivery',
    'equipment_setup', 'subcontractor', 'other_direct',
    'permit', 'venue', 'other_additional'
  )),
  description text,
  supplier_name text,
  reference_no text,
  amount numeric(14, 2) not null check (amount > 0),
  cost_date date not null,
  document_id uuid references documents(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint event_cost_entries_class_matches_type check (
    (cost_class = 'direct' and cost_type in ('food_ingredients', 'meat_seafood_vegetables', 'packaging', 'labour_overtime', 'transport_delivery', 'equipment_setup', 'subcontractor', 'other_direct'))
    or (cost_class = 'additional' and cost_type in ('permit', 'venue', 'other_additional'))
  )
);
create index event_cost_entries_event_idx on event_cost_entries (catering_event_id);
create index event_cost_entries_company_idx on event_cost_entries (company_id);

-- 4. Access: Finance / Admin of the company only (same rule as Finance payments)
alter table event_revenue_entries enable row level security;
alter table event_cost_entries enable row level security;

create policy event_revenue_entries_select on event_revenue_entries for select using (user_is_company_admin(company_id));
create policy event_revenue_entries_insert on event_revenue_entries for insert with check (user_is_company_admin(company_id));
create policy event_revenue_entries_update on event_revenue_entries for update using (user_is_company_admin(company_id)) with check (user_is_company_admin(company_id));
create policy event_revenue_entries_delete on event_revenue_entries for delete using (user_is_company_admin(company_id));
create policy event_revenue_entries_module_gate on event_revenue_entries as restrictive for all using (user_has_module(company_id, 'finance-admin')) with check (user_has_module(company_id, 'finance-admin'));

create policy event_cost_entries_select on event_cost_entries for select using (user_is_company_admin(company_id));
create policy event_cost_entries_insert on event_cost_entries for insert with check (user_is_company_admin(company_id));
create policy event_cost_entries_update on event_cost_entries for update using (user_is_company_admin(company_id)) with check (user_is_company_admin(company_id));
create policy event_cost_entries_delete on event_cost_entries for delete using (user_is_company_admin(company_id));
create policy event_cost_entries_module_gate on event_cost_entries as restrictive for all using (user_has_module(company_id, 'finance-admin')) with check (user_has_module(company_id, 'finance-admin'));
