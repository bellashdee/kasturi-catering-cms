-- A purchase order made from the menu of one or more events (Kitchen > Purchase Requests) remembers which events it was for.
alter table public.purchase_orders add column if not exists source_events text;
comment on column public.purchase_orders.source_events is 'Names (and dates) of the catering events whose menus this order was built from; null for an order typed by hand.';
