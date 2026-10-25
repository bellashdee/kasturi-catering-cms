-- The people who hold a petty cash, by the name of their staff record. A holder does not need a login (Adi has none): Penny and Nabilah record
-- for any of them, and a holder with a login sees his or her own petty cash. Changed by migration only (nobody edits it from the app).
create table if not exists public.operation_petty_cash_holders (
  full_name text primary key,
  created_at timestamptz not null default now()
);
alter table public.operation_petty_cash_holders enable row level security;
drop policy if exists operation_petty_cash_holders_read on public.operation_petty_cash_holders;
create policy operation_petty_cash_holders_read on public.operation_petty_cash_holders for select to authenticated using (true);

insert into public.operation_petty_cash_holders (full_name) values
  ('CHAN PIT NYET'),
  ('MOHD REDZA BIN MOHAMED JASMIN'),
  ('SAIFUL FADELI BIN AHMAD'),
  ('ISMAIZAL BIN MOHD ISMAIL'),
  ('NUR RASYIDAH NABILAH BINTI MOHD RASHIDI'),
  ('KHAIRUL ADLAN BIN SAGIMAN'),
  ('MOHAMMAD MUGHNI BIN MOHD ADNAN')
on conflict (full_name) do nothing;
