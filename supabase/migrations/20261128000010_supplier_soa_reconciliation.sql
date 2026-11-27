-- Supplier SOA reconciliation and Prepare Payment Voucher.
--
-- The supplier's Statement of Account (SOA) is an external statement: it is uploaded, read by the AI reader and compared with our
-- records. Nothing here creates a supplier invoice or changes one to match the statement. A payment voucher prepared from an approved
-- reconciliation goes into the existing PV numbering (finance_payments, PV-YYYYMM-NNN) only when Finance approves it, and the invoices
-- are paid (supplier_payments) only when the payment itself is recorded.
--
-- Each company keeps its own supplier ledger: every row carries company_id and the supplier of that company.

-- who approves supplier payments: the Director of Finance and her PA (the payroll_centre_access list)
create or replace function public.user_can_approve_supplier_payments() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payroll_centre_access where user_id = auth.uid());
$$;
revoke execute on function public.user_can_approve_supplier_payments() from anon, public;
grant execute on function public.user_can_approve_supplier_payments() to authenticated;

create table public.supplier_soa_reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  supplier_id uuid not null references public.suppliers(id),
  period_start date not null,
  period_end date not null,
  soa_document_id uuid references public.documents(id),
  status text not null default 'not_reconciled'
    check (status in ('not_reconciled', 'in_progress', 'discrepancy_found', 'reconciled', 'approved_for_payment', 'pv_issued', 'paid', 'cancelled')),
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'extracted', 'manual', 'failed')),
  extraction_note text,
  soa_statement_date date,
  -- the balances as the supplier states them
  supplier_opening numeric(14, 2),
  supplier_invoices numeric(14, 2),
  supplier_payments numeric(14, 2),
  supplier_credit_notes numeric(14, 2),
  supplier_debit_notes numeric(14, 2),
  supplier_closing numeric(14, 2),
  -- our ledger for the same company, supplier and period (worked out when matched)
  our_opening numeric(14, 2),
  our_invoices numeric(14, 2),
  our_payments numeric(14, 2),
  our_credit_notes numeric(14, 2),
  our_debit_notes numeric(14, 2),
  our_closing numeric(14, 2),
  difference numeric(14, 2),
  remarks text,
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now(),
  reconciled_by uuid,
  reconciled_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  approval_note text,
  exception_approved_by uuid,
  exception_approved_at timestamptz,
  exception_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index supplier_soa_recon_company_idx on public.supplier_soa_reconciliations (company_id, supplier_id, period_start);

create table public.supplier_soa_recon_lines (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.supplier_soa_reconciliations(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  -- 'supplier' = a line printed on the supplier's SOA; 'ours' = one of our records the SOA does not show
  source text not null check (source in ('supplier', 'ours')),
  line_no integer,
  line_date date,
  date_text text,
  line_type text not null default 'other' check (line_type in ('opening', 'invoice', 'payment', 'credit_note', 'debit_note', 'other')),
  reference text,
  description text,
  debit numeric(14, 2),
  credit numeric(14, 2),
  -- signed: + raises what we owe the supplier (invoice, debit note), - lowers it (payment, credit note)
  amount numeric(14, 2) not null default 0,
  balance numeric(14, 2),
  page text,
  status text not null default 'unmatched'
    check (status in ('matched', 'missing_in_ours', 'missing_in_soa', 'amount_mismatch', 'payment_not_reflected', 'duplicate', 'unmatched')),
  match_method text check (match_method in ('exact', 'fuzzy', 'manual')),
  match_confirmed boolean not null default false,
  matched_table text check (matched_table in ('supplier_invoices', 'supplier_notes', 'finance_payments', 'supplier_payments')),
  matched_id uuid,
  matched_ref text,
  matched_date date,
  matched_amount numeric(14, 2),
  suggestions jsonb,
  likely_cause text,
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index supplier_soa_recon_lines_recon_idx on public.supplier_soa_recon_lines (reconciliation_id, source, line_no);

create table public.supplier_pv_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  supplier_id uuid not null references public.suppliers(id),
  reconciliation_id uuid not null references public.supplier_soa_reconciliations(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled')),
  period_month date not null,
  total numeric(14, 2) not null default 0,
  remarks text,
  finance_payment_id uuid references public.finance_payments(id),
  voucher_number text,
  prepared_by uuid default auth.uid(),
  prepared_at timestamptz not null default now(),
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_note text,
  paid_date date,
  payment_reference text,
  paid_recorded_by uuid,
  paid_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index supplier_pv_drafts_recon_idx on public.supplier_pv_drafts (reconciliation_id);

create table public.supplier_pv_allocations (
  id uuid primary key default gen_random_uuid(),
  pv_draft_id uuid not null references public.supplier_pv_drafts(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  supplier_invoice_id uuid not null references public.supplier_invoices(id),
  invoice_amount numeric(14, 2) not null,
  outstanding_at_draft numeric(14, 2) not null,
  amount numeric(14, 2) not null check (amount > 0),
  over_authorised boolean not null default false,
  over_reason text,
  over_authorised_by uuid,
  over_authorised_at timestamptz,
  supplier_payment_id uuid references public.supplier_payments(id),
  created_at timestamptz not null default now(),
  unique (pv_draft_id, supplier_invoice_id),
  check (not over_authorised or (over_reason is not null and over_authorised_by is not null))
);
create index supplier_pv_allocations_invoice_idx on public.supplier_pv_allocations (supplier_invoice_id);

-- No invoice amount is allocated twice: what is already paid on the invoice + what open PV drafts hold for it may not pass the
-- invoice amount, unless that allocation was explicitly authorised (and the reason recorded).
create or replace function public.supplier_pv_allocation_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv_amount numeric;
  inv_company uuid;
  paid numeric;
  held numeric;
begin
  select amount, company_id into inv_amount, inv_company from public.supplier_invoices where id = new.supplier_invoice_id;
  if inv_amount is null then raise exception 'Invoice not found.'; end if;
  if inv_company <> new.company_id then raise exception 'The invoice belongs to another company.'; end if;
  if new.over_authorised then return new; end if;
  select coalesce(sum(amount), 0) into paid from public.supplier_payments
    where supplier_invoice_id = new.supplier_invoice_id and status = 'paid';
  select coalesce(sum(a.amount), 0) into held from public.supplier_pv_allocations a
    join public.supplier_pv_drafts d on d.id = a.pv_draft_id
    where a.supplier_invoice_id = new.supplier_invoice_id and a.id <> new.id and a.supplier_payment_id is null
      and d.status in ('draft', 'submitted', 'approved');
  if paid + held + new.amount > inv_amount + 0.005 then
    raise exception 'This invoice has only RM % left to pay (RM % paid, RM % held by other payment vouchers).',
      to_char(greatest(inv_amount - paid - held, 0), 'FM999999990.00'), to_char(paid, 'FM999999990.00'), to_char(held, 'FM999999990.00');
  end if;
  return new;
end;
$$;
revoke execute on function public.supplier_pv_allocation_guard() from anon, public;
create trigger supplier_pv_allocation_guard before insert or update of amount, over_authorised, supplier_invoice_id on public.supplier_pv_allocations
  for each row execute function public.supplier_pv_allocation_guard();

create trigger supplier_soa_recon_touch before update on public.supplier_soa_reconciliations for each row execute function public.set_updated_at();
create trigger supplier_soa_recon_lines_touch before update on public.supplier_soa_recon_lines for each row execute function public.set_updated_at();
create trigger supplier_pv_drafts_touch before update on public.supplier_pv_drafts for each row execute function public.set_updated_at();

-- RLS: everyone with access to the company may read; preparing / matching needs the supplier payment rights (Finance / Admin, or the
-- supplier payment editors); approvals are checked again in the server actions (Director of Finance and her PA).
alter table public.supplier_soa_reconciliations enable row level security;
alter table public.supplier_soa_recon_lines enable row level security;
alter table public.supplier_pv_drafts enable row level security;
alter table public.supplier_pv_allocations enable row level security;

create policy supplier_soa_recon_select on public.supplier_soa_reconciliations for select to authenticated
  using (company_id in (select public.user_company_ids()));
create policy supplier_soa_recon_insert on public.supplier_soa_reconciliations for insert to authenticated
  with check (public.user_can_manage_payments(company_id, 'supplier'));
create policy supplier_soa_recon_update on public.supplier_soa_reconciliations for update to authenticated
  using (public.user_can_manage_payments(company_id, 'supplier') or public.user_can_approve_supplier_payments())
  with check (company_id in (select public.user_company_ids()));

create policy supplier_soa_recon_lines_select on public.supplier_soa_recon_lines for select to authenticated
  using (company_id in (select public.user_company_ids()));
create policy supplier_soa_recon_lines_insert on public.supplier_soa_recon_lines for insert to authenticated
  with check (public.user_can_manage_payments(company_id, 'supplier'));
create policy supplier_soa_recon_lines_update on public.supplier_soa_recon_lines for update to authenticated
  using (public.user_can_manage_payments(company_id, 'supplier') or public.user_can_approve_supplier_payments())
  with check (company_id in (select public.user_company_ids()));
create policy supplier_soa_recon_lines_delete on public.supplier_soa_recon_lines for delete to authenticated
  using (public.user_can_manage_payments(company_id, 'supplier'));

create policy supplier_pv_drafts_select on public.supplier_pv_drafts for select to authenticated
  using (company_id in (select public.user_company_ids()));
create policy supplier_pv_drafts_insert on public.supplier_pv_drafts for insert to authenticated
  with check (public.user_can_manage_payments(company_id, 'supplier'));
create policy supplier_pv_drafts_update on public.supplier_pv_drafts for update to authenticated
  using (public.user_can_manage_payments(company_id, 'supplier') or public.user_can_approve_supplier_payments())
  with check (company_id in (select public.user_company_ids()));

create policy supplier_pv_allocations_select on public.supplier_pv_allocations for select to authenticated
  using (company_id in (select public.user_company_ids()));
create policy supplier_pv_allocations_insert on public.supplier_pv_allocations for insert to authenticated
  with check (public.user_can_manage_payments(company_id, 'supplier'));
create policy supplier_pv_allocations_update on public.supplier_pv_allocations for update to authenticated
  using (public.user_can_manage_payments(company_id, 'supplier') or public.user_can_approve_supplier_payments())
  with check (company_id in (select public.user_company_ids()));
create policy supplier_pv_allocations_delete on public.supplier_pv_allocations for delete to authenticated
  using (public.user_can_manage_payments(company_id, 'supplier'));
