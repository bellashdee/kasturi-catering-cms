-- Meal type "Wedding" for catering events and event days (additive: the four existing values stay valid).
alter table public.catering_events drop constraint catering_events_meal_types_check;
alter table public.catering_events add constraint catering_events_meal_types_check
  check (meal_types <@ array['breakfast', 'lunch', 'hi_tea', 'dinner', 'wedding']::text[]);
alter table public.catering_event_days drop constraint catering_event_days_meal_types_check;
alter table public.catering_event_days add constraint catering_event_days_meal_types_check
  check (meal_types <@ array['breakfast', 'lunch', 'hi_tea', 'dinner', 'wedding']::text[]);
