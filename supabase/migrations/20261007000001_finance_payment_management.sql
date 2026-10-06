-- Reference accounts: finance suppliers, rental payees and utility accounts (bank details are sensitive).
create table payment_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  category text not null check (category in ('supplier', 'rental', 'utility')),
  name text not null,
  provider text,
  utility_type text check (utility_type in ('electricity_water', 'electricity', 'water', 'indah_water')),
  bank_name text,
  account_no text,
  default_due_day integer check (default_due_day between 1 and 31),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payment_accounts_unique_key on payment_accounts(company_id, category, lower(name), coalesce(provider, ''));
create index payment_accounts_company_idx on payment_accounts(company_id, category);

-- Monthly payment records: supplier payments, rental and utilities. company_id is the company the payment is "of".
create table finance_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  category text not null check (category in ('supplier', 'rental', 'utility')),
  account_id uuid references payment_accounts(id) on delete set null,
  payee_name text not null,
  bank_name text,
  account_no text,
  utility_provider text,
  utility_location text,
  utility_type text check (utility_type in ('electricity_water', 'electricity', 'water', 'indah_water')),
  payment_of text,
  period_month date not null,
  invoice_number text,
  invoice_date date,
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_date date,
  payment_reference text,
  voucher_number text,
  voucher_document_id uuid references documents(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  proof_document_id uuid references documents(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  remarks text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_payments_paid_needs_details check (status = 'pending' or (paid_date is not null and payment_reference is not null))
);

create index finance_payments_company_month_idx on finance_payments(company_id, period_month);
create index finance_payments_category_idx on finance_payments(category, period_month);
create index finance_payments_due_idx on finance_payments(due_date) where status = 'pending';

create or replace function public.finance_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger payment_accounts_touch before update on payment_accounts for each row execute function public.finance_touch_updated_at();
create trigger finance_payments_touch before update on finance_payments for each row execute function public.finance_touch_updated_at();

-- Bank details and payment records are only for Super Admin / Company Admin of the company. Nothing is ever deleted.
alter table payment_accounts enable row level security;
create policy payment_accounts_select on payment_accounts for select using (public.user_is_company_admin(company_id));
create policy payment_accounts_insert on payment_accounts for insert with check (public.user_is_company_admin(company_id));
create policy payment_accounts_update on payment_accounts for update using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));

alter table finance_payments enable row level security;
create policy finance_payments_select on finance_payments for select using (public.user_is_company_admin(company_id));
create policy finance_payments_insert on finance_payments for insert with check (public.user_is_company_admin(company_id));
create policy finance_payments_update on finance_payments for update using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));
