-- "What the customer needs": an event keeps the same answers as a quotation request
-- (menu choices to quote and the customer's needs, the additional requirement answers, the extra items to quote),
-- so the New Event form and the sales agents' request form save the same fields. Additive only.
alter table public.catering_events
  add column if not exists requirements jsonb,
  add column if not exists additional jsonb,
  add column if not exists extra_items jsonb;

comment on column public.catering_events.requirements is 'What the customer needs: menuOptions, foodPreferences, dietary, equipment, serving (same shape as quotation_requests.requirements).';
comment on column public.catering_events.additional is 'Additional requirement answers (same shape as quotation_requests.additional).';
comment on column public.catering_events.extra_items is 'Extra items to add to the quotation, typed in by hand (not the additional requirement lines).';
