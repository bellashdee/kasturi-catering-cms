-- The Yes / No answers of "Additional requirement" (equipment handling, staff serving, transportation, dome set) are kept on the
-- quotation request, so the event page can show what the sales agent ticked. Additive only.
alter table public.quotation_requests add column if not exists additional jsonb check (additional is null or jsonb_typeof(additional) = 'object');
