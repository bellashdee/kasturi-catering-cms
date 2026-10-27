-- A petty cash entry (money received, spent, or a staff claim) is keyed in once with one amount and can be for more than one company
-- (for example RM 3,000 given for both Signature Solution and Kasturi Indah). company_id stays the main company (where the entry is
-- listed and counted); shared_company_ids holds the other companies it is also for. The amount is counted once, never split or doubled.
alter table public.operation_petty_cash add column if not exists shared_company_ids uuid[] not null default '{}';
alter table public.petty_cash_transactions add column if not exists shared_company_ids uuid[] not null default '{}';
