-- A payment ticked as completed in a checklist may not have its payment date / reference yet.
alter table finance_payments add column paid_details_pending boolean not null default false;

alter table finance_payments drop constraint finance_payments_paid_needs_details;
alter table finance_payments add constraint finance_payments_paid_needs_details
  check (status in ('pending', 'in_progress') or paid_details_pending or (paid_date is not null and payment_reference is not null));
