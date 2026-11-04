-- Quotation Request Form, more details: the customer's e-mail and company address, the event address, the menu and catering
-- requirements (menu options, food preferences, dietary, vegetarian, equipment, tables & chairs, serving), and attachments
-- (menu references, floor plans ...). The attachments are kept in a private bucket that only the inbox people can read.
-- Only additions: nothing existing is changed or removed.

alter table quotation_requests
  add column contact_email text,
  add column company_address text,
  add column event_address text,
  add column requirements jsonb not null default '{}'::jsonb;

-- the files a sales agent attached to a request (written by the server when the request is sent)
create table public.quotation_request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references quotation_requests(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index quotation_request_files_request_idx on public.quotation_request_files (request_id);
alter table public.quotation_request_files enable row level security;
create policy quotation_request_files_select on public.quotation_request_files for select to authenticated using (public.user_has_quotation_request_access());

-- private bucket, 10 MB a file; the public form uploads with a one-time permission from the server, only the inbox people can read
insert into storage.buckets (id, name, public, file_size_limit)
values ('quotation-request-files', 'quotation-request-files', false, 10485760)
on conflict (id) do nothing;
create policy quotation_request_files_read on storage.objects for select to authenticated
  using (bucket_id = 'quotation-request-files' and public.user_has_quotation_request_access());
