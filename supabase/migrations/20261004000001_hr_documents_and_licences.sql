-- HR documents with expiry tracking:
--  * employee documents (MC, confirmation letter, LOA, typhoid, ...) reuse employee_certificates
--  * company licences/agreements (MBJB licence, Halal licence, tenancy agreement) get their own table
--  * leave requests can carry a supporting file (e.g. an MC)

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'employee_certificates'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%cert_type%'
  loop
    execute format('alter table employee_certificates drop constraint %I', c.conname);
  end loop;
end $$;

alter table employee_certificates
  add constraint employee_certificates_cert_type_check
  check (cert_type in ('food_handling','typhoid','work_permit','training','medical_certificate','confirmation_letter','loa','other'));

-- Confirmation letters / LOAs don't expire.
alter table employee_certificates alter column expiry_date drop not null;

alter table leave_requests
  add column document_id uuid references documents(id) on delete set null;

create table company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  doc_type text not null check (doc_type in ('mbjb_licence','halal_licence','tenancy_agreement','other')),
  title text not null,
  reference_number text,
  issued_date date,
  expiry_date date,
  notes text,
  document_id uuid references documents(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index company_documents_company_idx on company_documents(company_id);
create index company_documents_expiry_idx on company_documents(expiry_date);

alter table company_documents enable row level security;
create policy company_documents_all on company_documents for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));
