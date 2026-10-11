-- Customer details filled in by sales agents through a public (no login) form. Nothing becomes a real customer until
-- someone with Catering access reviews and approves it. The public form writes through the server with the company fixed by
-- the link; no anonymous access to this table exists.
create table customer_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  sales_agent text not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  contact_person text,
  phone text,
  email text,
  registration_no text,
  billing_address text,
  delivery_address text,
  area text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  customer_id uuid references customers(id) on delete set null,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint intake_contact_required check (coalesce(btrim(phone), '') <> '' or coalesce(btrim(email), '') <> '')
);
create index customer_intake_submissions_status_idx on customer_intake_submissions (company_id, status, created_at desc);

alter table customer_intake_submissions enable row level security;
create policy "customer_intake_select" on customer_intake_submissions for select to authenticated
  using (public.user_has_company_access(company_id));
create policy "customer_intake_update" on customer_intake_submissions for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
