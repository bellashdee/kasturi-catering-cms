-- Probation tracker (HR). One current record per staff member, and a history of everything decided about it.
-- Only the admins of the company (Super Admin / Company Admin) can read or change these records.

create table public.employee_probation (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  start_date date,
  probation_months integer check (probation_months is null or probation_months between 1 and 12),
  -- the end date written by the offer letter: set when the record is made and never changed once an extension exists
  original_end_date date,
  -- the end date now in force (moves only when management approves an extension)
  current_end_date date,
  source text not null default 'manual' check (source in ('offer_letter', 'hr_record', 'manual')),
  position_in_letter text,
  letter_date date,
  offer_letter_document_id uuid references public.documents(id) on delete set null,
  needs_verification boolean not null default false,
  verification_note text,
  is_confirmed boolean not null default false,
  confirmed_date date,
  confirmation_letter_status text not null default 'none' check (confirmation_letter_status in ('none', 'draft', 'pending_approval', 'approved', 'issued')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employee_probation_company_idx on public.employee_probation(company_id);
create index employee_probation_end_idx on public.employee_probation(current_end_date) where not is_confirmed;

create table public.employee_probation_events (
  id uuid primary key default gen_random_uuid(),
  probation_id uuid not null references public.employee_probation(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- extension / confirmation = a letter that goes through approval; correction = HR fixed a detail; recorded = confirmation recorded without a letter
  kind text not null check (kind in ('extension', 'confirmation', 'correction', 'recorded')),
  reason text,
  notes text,
  evidence_document_id uuid references public.documents(id) on delete set null,
  previous_end_date date,
  new_end_date date,
  extension_months integer,
  effective_date date,
  letter_text text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'rejected', 'issued')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  issued_at timestamptz,
  issued_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now()
);

create index employee_probation_events_probation_idx on public.employee_probation_events(probation_id, created_at);

-- offer letters and the letters HR issues are filed as staff documents
alter table public.employee_certificates drop constraint if exists employee_certificates_cert_type_check;
alter table public.employee_certificates
  add constraint employee_certificates_cert_type_check
  check (cert_type in ('food_handling','typhoid','work_permit','training','medical_certificate','confirmation_letter','loa','warning_letter','show_cause_letter','contract','appraisal','offer_letter','probation_extension_letter','other'));

-- updated_at
drop trigger if exists employee_probation_set_updated_at on public.employee_probation;
create trigger employee_probation_set_updated_at before update on public.employee_probation for each row execute function public.set_updated_at();

-- the original dates are never overwritten once an extension has been recorded
create or replace function public.employee_probation_keep_original()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.employee_probation_events e where e.probation_id = old.id and e.kind = 'extension' and e.status <> 'rejected')
     and (new.original_end_date is distinct from old.original_end_date
          or new.start_date is distinct from old.start_date
          or new.probation_months is distinct from old.probation_months) then
    raise exception 'The original probation dates cannot be changed after an extension has been recorded.';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_probation_keep_original on public.employee_probation;
create trigger employee_probation_keep_original before update on public.employee_probation for each row execute function public.employee_probation_keep_original();

-- access: company admins only; the history can be added to and its status moved on, but never deleted
alter table public.employee_probation enable row level security;
alter table public.employee_probation_events enable row level security;

create policy employee_probation_select on public.employee_probation for select to authenticated using (public.user_is_company_admin(company_id));
create policy employee_probation_insert on public.employee_probation for insert to authenticated with check (public.user_is_company_admin(company_id));
create policy employee_probation_update on public.employee_probation for update to authenticated using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));

create policy employee_probation_events_select on public.employee_probation_events for select to authenticated using (public.user_is_company_admin(company_id));
create policy employee_probation_events_insert on public.employee_probation_events for insert to authenticated with check (public.user_is_company_admin(company_id));
create policy employee_probation_events_update on public.employee_probation_events for update to authenticated using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));

revoke all on public.employee_probation, public.employee_probation_events from anon;
