-- Staff record follows the "Personnel Information" form: employee number, address, permanent address, spouse, emergency contact,
-- job level, confirmed / promoted dates, education background and working experience.
-- The salary, bank and statutory numbers go in employee_private_details, which only the admins can read.
alter table public.employees
  add column employee_no text,
  add column old_ic_no text,
  add column passport_no text,
  add column home_phone text,
  add column address_line text,
  add column address_city text,
  add column address_state text,
  add column address_postcode text,
  add column perm_address_line text,
  add column perm_city text,
  add column perm_state text,
  add column perm_postcode text,
  add column spouse_name text,
  add column spouse_ic_no text,
  add column spouse_working boolean,
  add column children_count integer check (children_count is null or children_count >= 0),
  add column child_relief numeric(6, 2),
  add column emergency_name text,
  add column emergency_phone text,
  add column emergency_relationship text,
  add column job_level text,
  add column date_confirmed date,
  add column date_promoted date,
  add column education_background text,
  add column working_experience text;

alter table public.employee_private_details
  add column socso_no text,
  add column tax_no text,
  add column tax_branch text,
  add column bank_id text,
  add column bank_branch_code text,
  add column basic_rate numeric(12, 2),
  add column pay_basis text,
  add column payment_mode text;
