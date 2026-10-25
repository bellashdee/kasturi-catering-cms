-- Petty cash: who received (or spent) the money and the position that holds the petty cash, chosen from the staff list
alter table public.operation_petty_cash
  add column if not exists person_name text,
  add column if not exists person_position text;

alter table public.petty_cash_transactions
  add column if not exists person_name text,
  add column if not exists person_position text;
