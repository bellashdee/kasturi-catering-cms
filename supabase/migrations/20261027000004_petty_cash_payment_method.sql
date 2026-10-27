-- How the petty cash money was received: in cash or by online transfer (asked for every "Received (top-up)" entry; old entries have none)
alter table public.operation_petty_cash add column if not exists payment_method text;
alter table public.operation_petty_cash drop constraint if exists operation_petty_cash_payment_method_check;
alter table public.operation_petty_cash add constraint operation_petty_cash_payment_method_check check (payment_method is null or payment_method in ('cash', 'online_transfer'));
