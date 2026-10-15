-- A purchase list line remembers the purchase order made from it, so ordering the same list twice never doubles the orders.
-- If that purchase order is deleted the line simply becomes orderable again. Additive only.
alter table purchase_list_items add column purchase_order_id uuid references purchase_orders(id) on delete set null;
create index purchase_list_items_po_idx on purchase_list_items (purchase_order_id) where purchase_order_id is not null;
