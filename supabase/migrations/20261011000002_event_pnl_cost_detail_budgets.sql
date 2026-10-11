-- Event P&L, part 2 (approved plan): cost detail, actual vs estimated, edit tracking, event budgets, supplier invoice link.
-- Additive only. Estimated costs are stored but never enter the P&L; budgets live in their own table.

alter table event_cost_entries
  add column cost_basis text not null default 'actual' check (cost_basis in ('actual', 'estimated')),
  add column quantity numeric(14, 3) check (quantity is null or quantity > 0),
  add column unit text,
  add column unit_cost numeric(14, 4) check (unit_cost is null or unit_cost >= 0),
  add column payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  add column supplier_invoice_id uuid references supplier_invoices(id),
  add column updated_by uuid references profiles(id),
  add column updated_at timestamptz;

-- a supplier invoice can be the cost of one event only, and only once (so it can never be counted twice)
create unique index event_cost_entries_supplier_invoice_key on event_cost_entries (supplier_invoice_id) where supplier_invoice_id is not null;

alter table event_revenue_entries
  add column updated_by uuid references profiles(id),
  add column updated_at timestamptz;

create table event_budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  catering_event_id uuid not null references catering_events(id),
  budget_revenue numeric(14, 2) check (budget_revenue is null or budget_revenue >= 0),
  budget_direct_costs numeric(14, 2) check (budget_direct_costs is null or budget_direct_costs >= 0),
  budget_additional_costs numeric(14, 2) check (budget_additional_costs is null or budget_additional_costs >= 0),
  notes text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (catering_event_id)
);
create index event_budgets_company_idx on event_budgets (company_id);

alter table event_budgets enable row level security;
create policy event_budgets_select on event_budgets for select using (user_is_company_admin(company_id));
create policy event_budgets_insert on event_budgets for insert with check (user_is_company_admin(company_id));
create policy event_budgets_update on event_budgets for update using (user_is_company_admin(company_id)) with check (user_is_company_admin(company_id));
create policy event_budgets_module_gate on event_budgets as restrictive for all using (user_has_module(company_id, 'finance-admin')) with check (user_has_module(company_id, 'finance-admin'));
