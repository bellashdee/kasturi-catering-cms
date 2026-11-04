-- Remarks on a petty cash record: what the money was for, e.g. the event the things were bought for. Asked in the Petty Cash form
-- for money spent, staff claims and money received; older records have none.
alter table public.operation_petty_cash add column if not exists remarks text;
alter table public.petty_cash_transactions add column if not exists remarks text;
