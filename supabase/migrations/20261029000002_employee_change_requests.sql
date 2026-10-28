-- A staff member cannot change their own details: they ask for a change, and Madam Penny or Nabilah approves or rejects it.
-- Read and written only by the server (service role); no policy is given, so nobody can reach the table directly.
create table if not exists public.employee_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid not null,
  field text not null,
  old_value text,
  new_value text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists employee_change_requests_status_idx on public.employee_change_requests (status, created_at desc);
create index if not exists employee_change_requests_employee_idx on public.employee_change_requests (employee_id);
alter table public.employee_change_requests enable row level security;
