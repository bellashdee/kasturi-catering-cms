-- Purchase list: remember which weekly menu it was generated from (category, week number(s), meal session(s)).
-- Additive columns on the new purchase_lists table only.
alter table purchase_lists
  add column menu_category text,
  add column week_numbers integer[] not null default '{}',
  add column meal_sessions text[] not null default '{}';
