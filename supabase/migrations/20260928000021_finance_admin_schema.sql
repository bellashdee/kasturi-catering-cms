-- Cost Categories: a small shared list used to tag Company Expenses and Budgets
-- consistently. Global rows (company_id null) are seeded defaults everyone sees;
-- a company can also add its own on top.
create table cost_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

insert into cost_categories (company_id, name) values
  (null, 'Food & Ingredients'),
  (null, 'Staff Costs'),
  (null, 'Transport & Logistics'),
  (null, 'Marketing'),
  (null, 'Utilities'),
  (null, 'Rent & Facilities'),
  (null, 'Supplies & Equipment'),
  (null, 'Other');

-- Company Expenses: the Phase 1 `expenses` skeleton had no owning module — Finance
-- & Admin is it. Extend with the fields a real expense form needs.
alter table expenses
  add column department text,
  add column notes text,
  add column document_id uuid references documents(id) on delete set null,
  add column created_by uuid references profiles(id);

-- Petty Cash: a simple ledger (top-ups and spends) — balance is derived by
-- summing this table rather than stored, so it can never drift.
create table petty_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  type text not null check (type in ('top_up', 'expense')),
  category text,
  description text,
  amount numeric(12, 2) not null,
  transaction_date date not null,
  document_id uuid references documents(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Budgets: a target per company/department/category/month. Actual spend is
-- computed at read time from the real transaction tables, never copied in here.
create table budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  department text,
  category text not null,
  year integer not null,
  month integer not null check (month between 1 and 12),
  budgeted_amount numeric(12, 2) not null,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
