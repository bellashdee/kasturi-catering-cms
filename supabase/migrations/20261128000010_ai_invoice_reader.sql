-- AI Smart Invoice Reader: one job per uploaded supplier invoice file (PDF, scan, photo, WhatsApp screenshot, XML e-invoice,
-- Excel, Word). The AI reading is only a draft: nothing reaches supplier_invoices (finance / purchasing / event P&L) until a
-- person approves it. Jobs are never deleted (rejected jobs stay as history); every step is written to ai_invoice_events.

create table if not exists public.ai_invoice_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  document_id uuid not null references public.documents(id),
  original_filename text not null,
  file_sha256 text,
  file_size bigint,
  -- what the file really is (from its bytes, not its extension)
  detected_format text,
  detected_mime text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'extracted', 'needs_review', 'duplicate', 'failed', 'approved', 'rejected')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by uuid,
  error_code text,
  error_message text,
  error_recovery text,
  provider text,
  model text,
  -- values exactly as read from the file (never edited afterwards)
  original jsonb,
  -- the reviewer's values (start as a copy of the normalised reading)
  edited jsonb,
  -- per-field confidence, source page / cell, issues, pages read, tables
  report jsonb,
  -- figure checks, duplicates, supplier / company / purchase order matching
  checks jsonb,
  needs_review boolean not null default true,
  matched_supplier_id uuid references public.suppliers(id),
  purchase_order_id uuid references public.purchase_orders(id),
  -- searchable copies of the current values
  supplier_name text,
  invoice_number text,
  invoice_date date,
  total_amount numeric,
  po_number text,
  event_reference text,
  supplier_invoice_id uuid references public.supplier_invoices(id),
  duplicate_override boolean not null default false,
  reviewed_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  reject_reason text,
  -- id of the file in the device's offline outbox, so a file sent twice after reconnecting becomes one job
  client_upload_id text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_invoice_jobs_client_upload_uq on public.ai_invoice_jobs (created_by, client_upload_id) where client_upload_id is not null;
create index if not exists ai_invoice_jobs_company_status_idx on public.ai_invoice_jobs (company_id, status, created_at desc);
create index if not exists ai_invoice_jobs_hash_idx on public.ai_invoice_jobs (company_id, file_sha256);
create index if not exists ai_invoice_jobs_invoice_no_idx on public.ai_invoice_jobs (company_id, lower(invoice_number));
create index if not exists ai_invoice_jobs_document_idx on public.ai_invoice_jobs (document_id);

drop trigger if exists ai_invoice_jobs_updated_at on public.ai_invoice_jobs;
create trigger ai_invoice_jobs_updated_at before update on public.ai_invoice_jobs for each row execute function public.set_updated_at();

create table if not exists public.ai_invoice_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_invoice_jobs(id),
  company_id uuid not null references public.companies(id),
  action text not null,
  actor uuid default auth.uid(),
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_invoice_events_job_idx on public.ai_invoice_events (job_id, created_at);

alter table public.ai_invoice_jobs enable row level security;
alter table public.ai_invoice_events enable row level security;

-- Supplier & Procurement users of the company only. No delete policy: a job is rejected, never deleted.
drop policy if exists ai_invoice_jobs_select on public.ai_invoice_jobs;
create policy ai_invoice_jobs_select on public.ai_invoice_jobs for select to authenticated
  using (company_id in (select public.user_module_company_ids('supplier-procurement')));
drop policy if exists ai_invoice_jobs_insert on public.ai_invoice_jobs;
create policy ai_invoice_jobs_insert on public.ai_invoice_jobs for insert to authenticated
  with check (company_id in (select public.user_module_company_ids('supplier-procurement')) and company_id in (select public.user_company_ids()));
drop policy if exists ai_invoice_jobs_update on public.ai_invoice_jobs;
create policy ai_invoice_jobs_update on public.ai_invoice_jobs for update to authenticated
  using (company_id in (select public.user_module_company_ids('supplier-procurement')))
  with check (company_id in (select public.user_module_company_ids('supplier-procurement')) and company_id in (select public.user_company_ids()));

-- The audit trail can be added to and read, never changed or removed.
drop policy if exists ai_invoice_events_select on public.ai_invoice_events;
create policy ai_invoice_events_select on public.ai_invoice_events for select to authenticated
  using (company_id in (select public.user_module_company_ids('supplier-procurement')));
drop policy if exists ai_invoice_events_insert on public.ai_invoice_events;
create policy ai_invoice_events_insert on public.ai_invoice_events for insert to authenticated
  with check (company_id in (select public.user_module_company_ids('supplier-procurement')) and actor = auth.uid());

-- Takes the next waiting job (or one given job) for processing. Runs as the caller, so RLS limits it to the caller's companies.
-- A job left "processing" for 3 minutes (the worker stopped mid-way) goes back to the queue, or to failed after its last try.
create or replace function public.claim_ai_invoice_job(p_job_id uuid default null)
returns setof public.ai_invoice_jobs
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.ai_invoice_jobs
     set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
         locked_at = null,
         error_code = coalesce(error_code, 'worker_stopped'),
         error_message = coalesce(error_message, 'Processing stopped before it finished.')
   where status = 'processing' and locked_at < now() - interval '3 minutes';

  return query
  update public.ai_invoice_jobs j
     set status = 'processing', locked_at = now(), locked_by = auth.uid(), attempts = j.attempts + 1,
         error_code = null, error_message = null, error_recovery = null
   where j.id = (
     select q.id from public.ai_invoice_jobs q
      where q.status = 'queued' and q.next_attempt_at <= now() and (p_job_id is null or q.id = p_job_id)
      order by q.created_at
      for update skip locked
      limit 1)
  returning j.*;
end;
$$;

revoke all on function public.claim_ai_invoice_job(uuid) from public, anon;
grant execute on function public.claim_ai_invoice_job(uuid) to authenticated;
