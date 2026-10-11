-- Catering event: meal type(s), service type (first choice required in the form, second optional), event details, remarks.
-- Existing events keep these empty; the form makes the first service type mandatory for new and edited events.
alter table catering_events
  add column meal_types text[] not null default '{}'
    check (meal_types <@ array['breakfast', 'lunch', 'hi_tea', 'dinner']::text[]),
  add column service_type text
    check (service_type in ('pack_food', 'dome_set', 'buffet', 'pre_plated', 'hidang', 'buffet_pack')),
  add column second_service_type text
    check (second_service_type in ('pack_food', 'dome_set', 'buffet', 'pre_plated', 'hidang', 'buffet_pack')),
  add column event_details text,
  add column remarks text,
  add constraint catering_events_second_service_differs
    check (second_service_type is null or (service_type is not null and second_service_type <> service_type));
