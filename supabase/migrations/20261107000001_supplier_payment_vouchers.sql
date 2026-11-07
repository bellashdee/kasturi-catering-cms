-- One payment voucher per supplier per month (issued at the start of the next month): it lists the supplier invoices and the credit / debit notes of that month
-- and the net amount to pay. The lines are a snapshot (so a printed voucher does not change when an invoice is edited later); "Refresh" takes them again.
create table if not exists public.supplier_payment_vouchers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  period_month date not null,
  voucher_number text not null,
  voucher_date date not null,
  status text not null default 'issued' check (status in ('issued', 'paid')),
  paid_date date,
  payment_reference text,
  lines jsonb not null default '[]'::jsonb,
  invoices_total numeric(12, 2) not null default 0,
  credit_total numeric(12, 2) not null default 0,
  debit_total numeric(12, 2) not null default 0,
  net_amount numeric(12, 2) not null default 0,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, supplier_id, period_month),
  unique (company_id, voucher_number)
);
create index if not exists supplier_payment_vouchers_company_idx on public.supplier_payment_vouchers (company_id, period_month desc);

alter table public.supplier_payment_vouchers enable row level security;

drop policy if exists supplier_payment_vouchers_all on public.supplier_payment_vouchers;
create policy supplier_payment_vouchers_all on public.supplier_payment_vouchers for all to authenticated
  using (company_id in (select public.user_company_ids())) with check (company_id in (select public.user_company_ids()));
drop policy if exists supplier_payment_vouchers_module_gate on public.supplier_payment_vouchers;
create policy supplier_payment_vouchers_module_gate on public.supplier_payment_vouchers as restrictive for all to authenticated
  using (public.user_has_module(company_id, 'supplier-procurement')) with check (public.user_has_module(company_id, 'supplier-procurement'));
