-- Credit notes and debit notes of suppliers (the purchase side), like AutoCount: a credit note lowers what is owed to the supplier
-- (returned or wrongly charged goods), a debit note raises it (an extra charge). Optionally linked to the supplier invoice it corrects.
create table if not exists public.supplier_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  note_type text not null check (note_type in ('credit', 'debit')),
  note_number text not null,
  note_date date not null,
  supplier_invoice_id uuid references supplier_invoices(id) on delete set null,
  reason text,
  amount numeric(12, 2) not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, note_type, note_number)
);
create table if not exists public.supplier_note_items (
  id uuid primary key default gen_random_uuid(),
  supplier_note_id uuid not null references supplier_notes(id) on delete cascade,
  item_code text,
  item_name text not null,
  quantity numeric(10, 3) not null default 1,
  uom text,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0
);
create index if not exists supplier_notes_company_idx on public.supplier_notes (company_id, note_date desc);
create index if not exists supplier_note_items_note_idx on public.supplier_note_items (supplier_note_id);

alter table public.supplier_notes enable row level security;
alter table public.supplier_note_items enable row level security;

drop policy if exists supplier_notes_all on public.supplier_notes;
create policy supplier_notes_all on public.supplier_notes for all to authenticated
  using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
drop policy if exists supplier_notes_module_gate on public.supplier_notes;
create policy supplier_notes_module_gate on public.supplier_notes as restrictive for all to authenticated
  using (public.user_has_module(company_id, 'supplier-procurement')) with check (public.user_has_module(company_id, 'supplier-procurement'));

drop policy if exists supplier_note_items_all on public.supplier_note_items;
create policy supplier_note_items_all on public.supplier_note_items for all to authenticated
  using (exists (select 1 from supplier_notes n where n.id = supplier_note_items.supplier_note_id and public.user_has_company_access(n.company_id) and public.user_has_module(n.company_id, 'supplier-procurement')))
  with check (exists (select 1 from supplier_notes n where n.id = supplier_note_items.supplier_note_id and public.user_has_company_access(n.company_id) and public.user_has_module(n.company_id, 'supplier-procurement')));
