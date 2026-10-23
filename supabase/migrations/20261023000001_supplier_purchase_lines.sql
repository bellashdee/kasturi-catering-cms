-- What each supplier sold to each company: one row per item line of a purchase invoice (item, UOM, quantity, unit price).
-- The "items and prices" of a supplier are worked out from these lines; nothing here is typed in by hand.
create table public.supplier_purchase_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  doc_no text not null,
  doc_date date not null,
  line_no integer not null,
  item_code text,
  description text not null,
  uom text,
  quantity numeric(14, 4) not null,
  unit_price numeric(14, 4) not null,
  line_amount numeric(14, 2) not null,
  source text,
  created_at timestamptz not null default now(),
  unique (company_id, doc_no, line_no)
);

create index supplier_purchase_lines_supplier_idx on public.supplier_purchase_lines (supplier_id, doc_date desc);
create index supplier_purchase_lines_company_date_idx on public.supplier_purchase_lines (company_id, doc_date desc);

alter table public.supplier_purchase_lines enable row level security;

create policy supplier_purchase_lines_all on public.supplier_purchase_lines
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

create policy supplier_purchase_lines_module_gate on public.supplier_purchase_lines
  as restrictive for all to authenticated
  using (public.user_has_module(company_id, 'supplier-procurement'))
  with check (public.user_has_module(company_id, 'supplier-procurement'));
