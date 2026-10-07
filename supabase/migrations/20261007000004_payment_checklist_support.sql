-- Payment checklist support: priority, an "in progress" step, and payments whose due date is not known yet.
alter table finance_payments alter column due_date drop not null;
alter table finance_payments add column priority text check (priority in ('high', 'medium', 'low'));

alter table finance_payments drop constraint finance_payments_status_check;
alter table finance_payments add constraint finance_payments_status_check check (status in ('pending', 'in_progress', 'paid'));

alter table finance_payments drop constraint finance_payments_paid_needs_details;
alter table finance_payments add constraint finance_payments_paid_needs_details
  check (status in ('pending', 'in_progress') or (paid_date is not null and payment_reference is not null));

drop index if exists finance_payments_due_idx;
create index finance_payments_due_idx on finance_payments(due_date) where status <> 'paid';
