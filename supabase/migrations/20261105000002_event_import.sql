-- Confirmed events from Excel: an event keeps its end time, the address of the venue and the AutoCount quotation / invoice numbers,
-- and every approved Excel import is recorded (file, sheet, who approved it, when, what was created, updated or skipped, and the
-- old values of every updated event). Only the Quotation Request Inbox people (Ms. Nabilah, Mr. Adlan, Ms. Penny) can import.
-- Only additions: nothing existing is changed or removed.

alter table catering_events
  add column end_time time,
  add column event_address text,
  add column autocount_quotation_no text,
  add column autocount_invoice_no text;

create table public.event_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  file_name text not null,
  sheet_name text,
  imported_by uuid default auth.uid() references profiles(id) on delete set null,
  imported_at timestamptz not null default now(),
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  -- one entry per row: the action taken, the event, and for an update the old and new values
  details jsonb not null default '[]'::jsonb
);
create index event_import_batches_company_idx on public.event_import_batches (company_id, imported_at desc);
alter table public.event_import_batches enable row level security;
create policy event_import_batches_select on public.event_import_batches for select to authenticated
  using (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
create policy event_import_batches_insert on public.event_import_batches for insert to authenticated
  with check (public.user_has_quotation_request_access() and public.user_has_company_access(company_id) and imported_by = auth.uid());
