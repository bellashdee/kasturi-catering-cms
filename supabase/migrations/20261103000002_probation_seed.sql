-- Probation tracker: first load for the 46 staff in the database (one record per person, never duplicated).
-- The start date, position and probation period come from the offer letters HR holds (all of them say 3 months); a staff member
-- with no offer letter gets their HR join date and is flagged "to verify" with no probation period, so HR fills it in.
-- A staff member who already has a "Date Confirmed" in the HR record is recorded as Confirmed.
with letters(ic, start_date, months, position, letter_date, company) as (
  values
    ('840531-01-5212', date '2026-02-01', 3, 'Executive, Sales', date '2026-01-30', 'Kasturi Indah'),
    ('970205-01-6709', date '2026-02-05', 3, 'Chef De Partie', date '2026-01-02', 'Kasturi Indah'),
    ('830912-01-5313', date '2026-09-01', 3, 'Manager, Catering & Operation', date '2026-01-02', 'Kasturi Indah'),
    ('891115-01-6689', date '2026-01-16', 3, 'Executive Chef - Catering', date '2026-01-05', 'Kasturi Indah'),
    ('790422-01-6125', date '2026-04-17', 3, 'Senior Executive, Creative Content', date '2026-04-16', 'Kasturi Indah'),
    ('990527-01-5117', date '2025-09-01', 3, 'Manager, Operation', date '2025-09-01', 'Signature Solution'),
    ('840929-01-5167', date '2025-11-03', 3, 'Assistant, Operation Manager', date '2025-10-31', 'Signature Solution'),
    ('670911-08-6005', date '2025-08-12', 3, 'Chef De Partie', date '2025-08-11', 'Signature Solution'),
    ('620903-01-6183', date '2026-06-03', 3, 'Outlet Incharge', date '2026-06-02', 'Signature Solution'),
    ('761001-01-7805', date '2026-08-18', 3, 'Company Driver', date '2026-08-15', 'Signature Solution'),
    ('010812-01-1055', date '2026-06-05', 3, 'Company Driver', date '2026-06-04', 'Signature Solution'),
    ('020509-01-0796', date '2026-04-12', 3, 'Admin', date '2026-04-10', 'Signature Solution'),
    ('600308-01-5823', date '2026-05-16', 3, 'Outlet Chef', date '2026-05-15', 'Signature Solution')
),
people as (
  -- one staff record per person: the company of their offer letter, else a record that has a join date
  select distinct on (upper(regexp_replace(trim(e.full_name), '\s+', ' ', 'g')))
    e.id, e.company_id, e.join_date, e.date_confirmed, l.start_date as letter_start, l.months, l.position as letter_position, l.letter_date
  from public.employees e
  join public.companies c on c.id = e.company_id
  left join letters l on l.ic = e.ic_passport_no
  where e.status = 'active'
  order by upper(regexp_replace(trim(e.full_name), '\s+', ' ', 'g')), (l.company = c.name) desc nulls last, (e.date_confirmed is not null) desc, (e.join_date is not null) desc, c.name
)
insert into public.employee_probation (
  employee_id, company_id, start_date, probation_months, original_end_date, current_end_date, source, position_in_letter, letter_date,
  needs_verification, verification_note, is_confirmed, confirmed_date, confirmation_letter_status
)
select
  p.id,
  p.company_id,
  coalesce(p.letter_start, p.join_date),
  p.months,
  case when coalesce(p.letter_start, p.join_date) is not null and p.months is not null then (coalesce(p.letter_start, p.join_date) + make_interval(months => p.months))::date - 1 end,
  case when coalesce(p.letter_start, p.join_date) is not null and p.months is not null then (coalesce(p.letter_start, p.join_date) + make_interval(months => p.months))::date - 1 end,
  case when p.letter_start is not null then 'offer_letter' else 'hr_record' end,
  p.letter_position,
  p.letter_date,
  -- to verify: confirmed staff need nothing; the others when the probation period is unknown or the letter and the HR record disagree
  case when p.date_confirmed is not null then false
       when p.months is null then true
       when p.join_date is not null and p.letter_start is not null and p.join_date <> p.letter_start then true
       else false end,
  case when p.date_confirmed is not null then null
       when p.months is null and coalesce(p.letter_start, p.join_date) is null then 'No offer letter and no start date on file. Upload the offer letter, or enter the start date and probation period.'
       when p.months is null then 'No offer letter on file: the start date is the HR join date. Upload the offer letter, or enter the probation period.'
       when p.join_date is not null and p.letter_start is not null and p.join_date <> p.letter_start then 'The offer letter says the staff member starts on ' || to_char(p.letter_start, 'DD Mon YYYY') || ' but the HR record says ' || to_char(p.join_date, 'DD Mon YYYY') || '. Check which one is right.'
       end,
  p.date_confirmed is not null,
  p.date_confirmed,
  case when p.date_confirmed is not null then 'issued' else 'none' end
from people p
on conflict (employee_id) do nothing;
