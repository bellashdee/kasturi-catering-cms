-- Total sales per company per month, used by Monthly Costing for Cost vs Sales %
-- and Profit / Loss %. Entered manually (or imported from the monthly costing workbook).

create table monthly_sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  sales_amount numeric(14,2) not null check (sales_amount >= 0),
  notes text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, year, month)
);

create index monthly_sales_company_idx on monthly_sales(company_id);

alter table monthly_sales enable row level security;
create policy monthly_sales_all on monthly_sales for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));
