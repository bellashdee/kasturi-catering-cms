-- Multi-day events: a production order and a delivery per event day. Both tables get a nullable link to the day they
-- are for (single-day events and rows created before this stay without one). Additive only.
-- ON DELETE SET NULL: removing a day from an event never deletes the production order / delivery that was made for it.
alter table production_orders add column catering_event_day_id uuid references catering_event_days(id) on delete set null;
alter table deliveries add column catering_event_day_id uuid references catering_event_days(id) on delete set null;

create index production_orders_event_day_idx on production_orders (catering_event_day_id) where catering_event_day_id is not null;
create index deliveries_event_day_idx on deliveries (catering_event_day_id) where catering_event_day_id is not null;

-- Duplicate protection: confirming (or double-clicking) twice cannot make a second delivery for the same day, nor a
-- second general (no recipe / no menu dish) production order for the same day.
create unique index deliveries_one_per_event_day on deliveries (catering_event_day_id) where catering_event_day_id is not null;
create unique index production_orders_one_general_per_event_day on production_orders (catering_event_day_id)
  where catering_event_day_id is not null and recipe_id is null and menu_plan_dish_id is null;
