-- An optional invoice number (as printed on the supplier's invoice / receipt) on company expenses,
-- petty cash book entries and staff claims (petty cash claims and My Claims). Additive only.
alter table public.expenses add column if not exists invoice_no text;
alter table public.operation_petty_cash add column if not exists invoice_no text;
alter table public.petty_cash_transactions add column if not exists invoice_no text;
