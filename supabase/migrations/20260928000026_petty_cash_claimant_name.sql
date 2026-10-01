-- Claimant is entered as free text (typed by whoever submits the claim)
-- rather than selected from the Staff Database, per product direction.
-- claimant_employee_id from the previous migration is left in place, unused.
alter table petty_cash_transactions
  add column if not exists claimant_name text,
  add column if not exists claimant_department text;
