-- A payment that was cancelled stays on record (nothing is deleted) but is no longer counted as owing.
alter table finance_payments drop constraint finance_payments_status_check;
alter table finance_payments add constraint finance_payments_status_check
  check (status in ('pending', 'in_progress', 'paid', 'cancelled'));

alter table finance_payments drop constraint finance_payments_paid_needs_details;
alter table finance_payments add constraint finance_payments_paid_needs_details
  check (status in ('pending', 'in_progress', 'cancelled') or paid_details_pending or (paid_date is not null and payment_reference is not null));
