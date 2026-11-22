-- Supplier invoices get a remarks note. For the GENERAL SUPPLIER (any supplier not in the list yet) it holds the real supplier's name.
-- The column was already added in the database; this keeps the migration history in step (safe to run again).

alter table public.supplier_invoices add column if not exists remarks text;
