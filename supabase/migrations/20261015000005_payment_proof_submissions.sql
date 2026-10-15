-- Proof of a customer's payment sent by a sales agent through a public (no login) form: which invoice, when, how it was paid and
-- the uploaded proof. Nothing becomes a recorded payment until someone with Finance access reviews and approves it. The public
-- form writes through the server with the company fixed by the link; there is no anonymous access to this table.
-- The proof file is kept in the private "documents" bucket under <company id>/payment-proofs/, so the existing storage rules
-- (people with access to that company) decide who can open it.
create table payment_proof_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  sales_agent text not null,
  invoice_number text not null check (length(btrim(invoice_number)) between 1 and 100),
  customer_invoice_id uuid references customer_invoices(id) on delete set null,
  payment_date date not null,
  payment_method text not null check (payment_method in ('bank_transfer', 'online_banking', 'cash', 'cheque', 'ewallet', 'card', 'other')),
  amount numeric(12, 2) check (amount is null or amount > 0),
  reference text,
  remarks text,
  proof_path text not null,
  proof_filename text,
  proof_mime text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_proof_submissions_status_idx on payment_proof_submissions (company_id, status, created_at desc);
create index payment_proof_submissions_invoice_idx on payment_proof_submissions (customer_invoice_id) where customer_invoice_id is not null;

create trigger payment_proof_submissions_set_updated_at before update on payment_proof_submissions
  for each row execute function public.set_updated_at();

alter table payment_proof_submissions enable row level security;
create policy "payment_proof_submissions_select" on payment_proof_submissions for select to authenticated
  using (public.user_has_company_access(company_id));
create policy "payment_proof_submissions_update" on payment_proof_submissions for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
