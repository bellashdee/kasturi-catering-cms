-- Pax for each service type of a catering event: how many guests get the first service type and how many the second.
-- A service type and its pax come together (both set or both empty); no existing event has a service type yet.
alter table catering_events
  add column service_pax integer check (service_pax is null or service_pax > 0),
  add column second_service_pax integer check (second_service_pax is null or second_service_pax > 0),
  add constraint catering_events_service_pax_pair check ((service_type is null) = (service_pax is null)),
  add constraint catering_events_second_service_pax_pair check ((second_service_type is null) = (second_service_pax is null));
