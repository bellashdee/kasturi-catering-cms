-- Service types: Cocktail / Canape and Live Cooking Station added (additive: the six existing values stay valid; hidang is shown as "Serve", pre_plated as "Preplated").
alter table public.catering_events drop constraint catering_events_service_type_check;
alter table public.catering_events add constraint catering_events_service_type_check
  check (service_type in ('pack_food', 'dome_set', 'buffet', 'pre_plated', 'hidang', 'buffet_pack', 'cocktail_canape', 'live_cooking_station'));
alter table public.catering_events drop constraint catering_events_second_service_type_check;
alter table public.catering_events add constraint catering_events_second_service_type_check
  check (second_service_type in ('pack_food', 'dome_set', 'buffet', 'pre_plated', 'hidang', 'buffet_pack', 'cocktail_canape', 'live_cooking_station'));
alter table public.catering_event_days drop constraint catering_event_days_service_type_check;
alter table public.catering_event_days add constraint catering_event_days_service_type_check
  check (service_type in ('pack_food', 'dome_set', 'buffet', 'pre_plated', 'hidang', 'buffet_pack', 'cocktail_canape', 'live_cooking_station'));
alter table public.catering_event_days drop constraint catering_event_days_second_service_type_check;
alter table public.catering_event_days add constraint catering_event_days_second_service_type_check
  check (second_service_type in ('pack_food', 'dome_set', 'buffet', 'pre_plated', 'hidang', 'buffet_pack', 'cocktail_canape', 'live_cooking_station'));
