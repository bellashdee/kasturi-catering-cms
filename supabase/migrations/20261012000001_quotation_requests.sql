-- Quotation requests filled in by sales agents through a public (no login) form. Nothing becomes a catering event or a
-- quotation until someone with Catering access reviews and approves it. The public form writes through the server with the
-- company fixed by the link; no anonymous access to this table exists.
create table quotation_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  sales_agent text not null,
  customer_name text not null check (length(btrim(customer_name)) between 1 and 200),
  event_name text not null check (length(btrim(event_name)) between 1 and 200),
  event_type text not null default 'other' check (event_type in ('wedding','corporate','birthday','funeral','other')),
  location text,
  pic_name text,
  pic_phone text,
  kitchen_setup text,
  catering_setup text,
  remarks text,
  days jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) between 1 and 14),
  extra_items jsonb not null default '[]'::jsonb check (jsonb_typeof(extra_items) = 'array' and jsonb_array_length(extra_items) <= 30),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  catering_event_id uuid references catering_events(id) on delete set null,
  quotation_id uuid references quotations(id) on delete set null,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index quotation_requests_status_idx on quotation_requests (company_id, status, created_at desc);

alter table quotation_requests enable row level security;
create policy "quotation_requests_select" on quotation_requests for select to authenticated
  using (public.user_has_company_access(company_id));
create policy "quotation_requests_update" on quotation_requests for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
