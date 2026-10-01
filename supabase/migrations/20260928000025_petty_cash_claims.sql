alter table petty_cash_transactions
  add column if not exists claimant_employee_id uuid references employees(id) on delete set null,
  add column if not exists payment_status text not null default 'paid' check (payment_status in ('pending_payment','paid')),
  add column if not exists payment_date date,
  add column if not exists payment_reference text,
  add column if not exists payment_remarks text,
  add column if not exists paid_by uuid references auth.users(id) on delete set null;

create index if not exists petty_cash_transactions_claimant_idx on petty_cash_transactions(claimant_employee_id);
create index if not exists petty_cash_transactions_payment_status_idx on petty_cash_transactions(payment_status);
