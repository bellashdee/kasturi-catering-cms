-- Cash or online transfer for every petty cash record: how a staff member paid when they bought something (the claim) and how the
-- claim was paid back to them (the staff claim payment). Money spent from the cash book uses operation_petty_cash.payment_method too.
alter table public.petty_cash_transactions add column if not exists payment_method text;
alter table public.petty_cash_transactions drop constraint if exists petty_cash_transactions_payment_method_check;
alter table public.petty_cash_transactions add constraint petty_cash_transactions_payment_method_check check (payment_method is null or payment_method in ('cash', 'online_transfer'));

alter table public.petty_cash_transactions add column if not exists claim_payment_method text;
alter table public.petty_cash_transactions drop constraint if exists petty_cash_transactions_claim_payment_method_check;
alter table public.petty_cash_transactions add constraint petty_cash_transactions_claim_payment_method_check check (claim_payment_method is null or claim_payment_method in ('cash', 'online_transfer'));
