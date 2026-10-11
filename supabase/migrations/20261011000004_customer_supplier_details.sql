-- Customer and supplier master details (from the AutoCount debtor / creditor reports): account code, registration number,
-- addresses, area, credit term and limit, and a source note. All optional; existing rows and screens are unaffected.
alter table customers
  add column account_code text,
  add column registration_no text,
  add column billing_address text,
  add column delivery_address text,
  add column area text,
  add column credit_term text,
  add column credit_limit numeric(14, 2) check (credit_limit is null or credit_limit >= 0),
  add column notes text;

alter table suppliers
  add column account_code text,
  add column registration_no text,
  add column billing_address text,
  add column area text,
  add column credit_limit numeric(14, 2) check (credit_limit is null or credit_limit >= 0),
  add column email text,
  add column notes text;

-- the same customer / supplier name cannot be added twice for one company (case-insensitive)
create unique index customers_company_name_key on customers (company_id, lower(btrim(name)));
create unique index suppliers_company_name_key on suppliers (company_id, lower(btrim(name)));
