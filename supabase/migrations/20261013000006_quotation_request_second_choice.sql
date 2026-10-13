-- Quotation request form: an optional second choice (an alternative menu offered for the whole event: menu, pax, meal types,
-- service type, price per meal). It is shown to the office and written into the event details on approval; it is not
-- added to the quotation total. The "additional equipment" ticks (equipment handling, staff serving, transportation) are
-- stored as extra_items, which already exists. Additive only.
alter table quotation_requests add column second_choice jsonb check (second_choice is null or jsonb_typeof(second_choice) = 'object');
