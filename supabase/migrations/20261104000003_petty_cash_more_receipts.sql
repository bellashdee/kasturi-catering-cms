-- More than one receipt / photo on a petty cash record: document_id stays the first one, the others are kept here in order.
alter table public.operation_petty_cash add column if not exists extra_document_ids uuid[] not null default '{}';
alter table public.petty_cash_transactions add column if not exists extra_document_ids uuid[] not null default '{}';
