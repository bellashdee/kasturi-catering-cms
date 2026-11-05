-- 1. Recipes: a recipe suggested from a Google reference stays a DRAFT until a chef reviews and approves it.
--    Every recipe that exists today is an approved company recipe, so nothing changes for them.
alter table public.recipes
  add column if not exists status text not null default 'approved' check (status in ('draft', 'approved')),
  add column if not exists source_note text,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

-- 2. Kitchen purchase request: Kitchen lists the ingredients of the event menus and fills in the quantities; the Purchaser adds
--    supplier prices; a manager approves. Quantities are always typed in by Kitchen, never calculated from the pax.
create table public.kitchen_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_no text not null,
  catering_event_id uuid references public.catering_events(id) on delete set null,
  event_name text not null,
  event_date date,
  status text not null default 'draft' check (status in ('draft', 'pending_submission', 'submitted', 'under_review', 'revision_required', 'pending_approval', 'approved', 'purchased', 'completed', 'rejected')),
  kitchen_notes text,
  return_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (company_id, request_no)
);
create index kitchen_purchase_requests_company_idx on public.kitchen_purchase_requests (company_id, status, created_at desc);
create index kitchen_purchase_requests_event_idx on public.kitchen_purchase_requests (catering_event_id);

create table public.supplier_price_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  item_key text not null,
  item_name text not null,
  unit text not null,
  price_per_unit numeric(14, 4) not null check (price_per_unit >= 0),
  note text,
  quoted_on date not null default current_date,
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index supplier_price_quotes_item_idx on public.supplier_price_quotes (company_id, item_key, created_at desc);
create index supplier_price_quotes_supplier_idx on public.supplier_price_quotes (supplier_id, created_at desc);

create table public.kitchen_purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.kitchen_purchase_requests(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sort_order integer not null default 0,
  item_name text not null,
  item_key text not null,
  unit text not null,
  quantity numeric(14, 3) check (quantity is null or quantity > 0),
  menus text[] not null default '{}',
  remark text,
  selected_quote_id uuid references public.supplier_price_quotes(id) on delete set null
);
create index kitchen_purchase_request_items_request_idx on public.kitchen_purchase_request_items (request_id, sort_order);

alter table public.kitchen_purchase_requests enable row level security;
alter table public.kitchen_purchase_request_items enable row level security;
alter table public.supplier_price_quotes enable row level security;
create policy kitchen_purchase_requests_all on public.kitchen_purchase_requests for all to authenticated using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
create policy kitchen_purchase_request_items_all on public.kitchen_purchase_request_items for all to authenticated using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
create policy supplier_price_quotes_all on public.supplier_price_quotes for all to authenticated using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
