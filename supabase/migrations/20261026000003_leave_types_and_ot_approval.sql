-- Leave types: the full list used by the company (Annual, Medical, Emergency, Unpaid, Hospitalisation, Replacement, Maternity, Bereavement,
-- Marriage and Other, where the person writes what the leave is for).
alter table public.leave_requests drop constraint if exists leave_requests_leave_type_check;
alter table public.leave_requests add constraint leave_requests_leave_type_check
  check (leave_type in ('annual', 'medical', 'emergency', 'unpaid', 'hospitalisation', 'replacement', 'maternity', 'bereavement', 'marriage', 'other'));
alter table public.leave_requests add column if not exists leave_type_other text;
