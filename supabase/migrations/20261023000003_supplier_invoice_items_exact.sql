-- A supplier invoice is saved exactly as printed: every line keeps its item code, unit of measure, quantity, unit price,
-- discount and line amount. Quantity and price used to be rounded to 2 decimals (e.g. 11.816 kg became 11.82).
alter table public.supplier_invoice_items
  alter column quantity type numeric(14, 4),
  alter column unit_price type numeric(14, 4),
  add column item_code text,
  add column uom text,
  add column discount numeric(14, 2);
