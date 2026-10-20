-- Payroll Centre (reference for the Director of Finance): one payroll record per staff record per month, with the payment details
-- written when the salary is paid.
alter table public.payroll_records
  add column if not exists paid_on date,
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists paid_by uuid references auth.users(id),
  add column if not exists remarks text,
  add column if not exists updated_at timestamptz not null default now();

-- one record per staff record and pay period start (the centre works month by month)
create unique index if not exists payroll_records_employee_period_key on public.payroll_records (employee_id, pay_period_start);

create or replace function public.payroll_records_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists payroll_records_touch on public.payroll_records;
create trigger payroll_records_touch before update on public.payroll_records for each row execute function public.payroll_records_touch();
