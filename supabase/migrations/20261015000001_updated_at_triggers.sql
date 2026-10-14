-- Updated At: the database stamps "updated_at" every time a row of an important business table is changed, whichever screen or
-- action changed it. Existing rows start with their own created_at, so no historical record shows a made-up date.
-- Additive only: one new column per table and one trigger; nothing is deleted or rewritten except filling the new column.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'catering_events', 'quotations', 'customers', 'customer_invoices', 'customer_payments', 'deliveries', 'production_orders',
    'purchase_requests', 'procurement_requests', 'purchase_orders', 'supplier_invoices', 'supplier_payments', 'suppliers',
    'petty_cash_transactions', 'expenses', 'leave_requests', 'ingredients', 'recipes', 'vehicles', 'driver_expenses', 'approvals'
  ] loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz', t);
    execute format('update public.%I set updated_at = created_at where updated_at is null', t);
    execute format('alter table public.%I alter column updated_at set default now()', t);
    execute format('alter table public.%I alter column updated_at set not null', t);
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end;
$$;
