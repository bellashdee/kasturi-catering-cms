-- Event P&L: "Others" is a direct cost category of its own (Ms. Penny's list of 11 Nov 2026), for supplier invoice items that fit no other category.
alter table public.event_cost_entries drop constraint if exists event_cost_entries_cost_type_check;
alter table public.event_cost_entries drop constraint if exists event_cost_entries_class_matches_type;
alter table public.event_cost_entries add constraint event_cost_entries_cost_type_check check (cost_type in (
  'chicken', 'meat', 'seafood', 'vegetables', 'fruits', 'ice', 'others', 'dry_goods_groceries', 'bakery', 'packaging', 'transport_delivery', 'labour_overtime', 'equipment_rental', 'event_setup',
  'food_ingredients', 'meat_seafood_vegetables', 'equipment_setup', 'subcontractor', 'other_direct',
  'permit', 'venue', 'other_additional'
));
alter table public.event_cost_entries add constraint event_cost_entries_class_matches_type check (
  (cost_class = 'direct' and cost_type in (
    'chicken', 'meat', 'seafood', 'vegetables', 'fruits', 'ice', 'others', 'dry_goods_groceries', 'bakery', 'packaging', 'transport_delivery', 'labour_overtime', 'equipment_rental', 'event_setup',
    'food_ingredients', 'meat_seafood_vegetables', 'equipment_setup', 'subcontractor', 'other_direct'))
  or (cost_class = 'additional' and cost_type in ('permit', 'venue', 'other_additional'))
);
