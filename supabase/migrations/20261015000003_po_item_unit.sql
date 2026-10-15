-- Purchase order lines: a unit of measure per item (kg, pcs, pack ...) because the unit differs from item to item, and room for
-- three decimals in the quantity (e.g. 0.375 kg). Widening a numeric column keeps every existing value. Additive only.
alter table purchase_order_items add column unit text;
alter table purchase_order_items alter column quantity type numeric(12, 3);
