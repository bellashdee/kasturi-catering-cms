-- Ingredient unit costs are per gram / per piece (RM 0.0035 per G), so they need more than 2 decimals.
alter table public.ingredients alter column unit_cost type numeric(14, 6);
