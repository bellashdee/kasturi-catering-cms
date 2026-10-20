-- Meal types of catering events and event days: the new list (additive: breakfast, lunch, hi_tea, dinner and the earlier wedding stay valid).
alter table public.catering_events drop constraint catering_events_meal_types_check;
alter table public.catering_events add constraint catering_events_meal_types_check
  check (meal_types <@ array['breakfast', 'morning_tea', 'morning_break', 'brunch', 'lunch', 'afternoon_tea', 'tea_break', 'hi_tea', 'dinner', 'supper', 'refreshment', 'buffet', 'packed_meal', 'plated_meal', 'cocktail_reception', 'wedding']::text[]);
alter table public.catering_event_days drop constraint catering_event_days_meal_types_check;
alter table public.catering_event_days add constraint catering_event_days_meal_types_check
  check (meal_types <@ array['breakfast', 'morning_tea', 'morning_break', 'brunch', 'lunch', 'afternoon_tea', 'tea_break', 'hi_tea', 'dinner', 'supper', 'refreshment', 'buffet', 'packed_meal', 'plated_meal', 'cocktail_reception', 'wedding']::text[]);
