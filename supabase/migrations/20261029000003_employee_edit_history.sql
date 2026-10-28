-- Who changed which detail of a staff record, and when. Written and read only by the server (service role); no policy is given.
-- (The change-request / approval table of the same day is replaced by this history.)
drop table if exists public.employee_change_requests;

create table if not exists public.employee_edit_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  edited_by uuid,
  edited_by_name text not null,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists employee_edit_history_employee_idx on public.employee_edit_history (employee_id, created_at desc);
alter table public.employee_edit_history enable row level security;
