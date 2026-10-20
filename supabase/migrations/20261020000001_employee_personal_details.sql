-- Staff Information: date of birth, nationality, gender, race, religion, marital status and branch (all optional).
alter table public.employees
  add column date_of_birth date,
  add column nationality text,
  add column gender text check (gender in ('Male', 'Female')),
  add column race text,
  add column religion text,
  add column marital_status text,
  add column branch text;
