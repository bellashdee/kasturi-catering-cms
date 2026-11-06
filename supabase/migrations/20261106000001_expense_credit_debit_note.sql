-- A company expense can be marked as a Credit Note (money given back by the supplier: counted as minus in the totals) or a Debit Note
-- (an extra charge: counted as a cost). Unmarked expenses are ordinary costs.
alter table public.expenses add column if not exists note_type text;
alter table public.expenses drop constraint if exists expenses_note_type_check;
alter table public.expenses add constraint expenses_note_type_check check (note_type is null or note_type in ('credit_note', 'debit_note'));
