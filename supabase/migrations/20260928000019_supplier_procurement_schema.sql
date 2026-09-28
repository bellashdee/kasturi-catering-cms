-- Suppliers: extend the Phase 1 skeleton
alter table suppliers
  add column category text,
  add column payment_terms text,
  add column status text not null default 'active' check (status in ('active', 'inactive', 'blacklisted'));

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  po_number text not null,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'sent', 'acknowledged', 'completed', 'cancelled')),
  order_date date not null,
  total_amount numeric(12, 2) not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  item_name text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2) not null
);

-- Generic company purchase request — distinct from Kitchen's ingredient-specific
-- `purchase_requests`. Reuses the existing `approvals` table for its approval
-- workflow, the same way HR's leave_requests already does (own status + an
-- approval_id pointer, kept in sync by one action).
create table procurement_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  requester_id uuid references profiles(id),
  department text,
  item_name text not null,
  quantity numeric(10, 2) not null default 1,
  estimated_cost numeric(12, 2),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'converted')),
  approval_id uuid references approvals(id) on delete set null,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Supplier invoices: extend with items, department, PO link and an attachment
alter table supplier_invoices
  add column department text,
  add column purchase_order_id uuid references purchase_orders(id) on delete set null,
  add column document_id uuid references documents(id) on delete set null;

create table supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references supplier_invoices(id) on delete cascade,
  item_name text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2) not null
);

-- Supplier payments: was just a paid-payment log; now also doubles as the
-- "payment request" itself (status starts 'pending', payment_date/method/
-- reference/receipt are only filled in once it's actually executed). Also
-- goes through the shared `approvals` table, same pattern as procurement_requests.
alter table supplier_payments
  alter column payment_date drop not null,
  add column status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  add column payment_method text,
  add column reference_number text,
  add column receipt_document_id uuid references documents(id) on delete set null,
  add column approval_id uuid references approvals(id) on delete set null,
  add column requested_by uuid references profiles(id);
