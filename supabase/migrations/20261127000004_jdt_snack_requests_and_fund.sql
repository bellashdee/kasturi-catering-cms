-- JDT II Training Snack / Refreshment requests (Signature Solution) and the JDT II Snack Fund (RM500, one time only).
-- Only additions. The snack money is kept apart from event costing and P&L: nothing here is read by them.

-- who may do what (Signature Solution only):
--   see a request and its items (no money): everyone of the company (Kitchen, Operations, Drivers ...)
--   add a request: the Quotation Request people (Admin / Management)
--   work on it (status, items, purchases, receipts): Purchasing (Supplier & Procurement), Admin & Finance, or the Quotation Request people
--   see / record money (purchases, the fund): the same as above; Kitchen and Drivers do not
--   approve an additional allocation: a company admin (Management)
create or replace function public.user_can_handle_snacks(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.user_has_quotation_request_access()
      or public.user_has_module(target_company_id, 'supplier-procurement')
      or public.user_has_module(target_company_id, 'finance-admin');
$$;

create table if not exists public.jdt_snack_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  request_code text,
  team text not null default 'JDT II',
  training_date date,
  date_text text,
  date_needs_check boolean not null default false,
  delivery_time time,
  delivery_location text,
  remarks text,
  status text not null default 'new_request' check (status in ('new_request','pending_confirmation','approved','purchase_in_progress','purchased','delivered','completed','cancelled')),
  delivered_at timestamptz,
  whatsapp_import_id uuid references public.whatsapp_imports(id) on delete set null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists jdt_snack_requests_company_idx on public.jdt_snack_requests (company_id, training_date desc);

create table if not exists public.jdt_snack_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.jdt_snack_requests(id) on delete cascade,
  sort_order int not null default 0,
  name text not null,
  requested_qty numeric check (requested_qty is null or requested_qty > 0),
  unit text,
  remarks text,
  item_status text not null default 'pending' check (item_status in ('pending','purchased','unavailable','substituted')),
  substitute text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jdt_snack_items_request_idx on public.jdt_snack_items (request_id, sort_order);

-- every purchase (the snack fund's expenses): with or without a request / item
create table if not exists public.jdt_snack_purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  request_id uuid references public.jdt_snack_requests(id) on delete set null,
  item_id uuid references public.jdt_snack_items(id) on delete set null,
  purchase_date date not null,
  training_date date,
  description text not null,
  quantity numeric check (quantity is null or quantity > 0),
  unit text,
  supplier text,
  unit_price numeric check (unit_price is null or unit_price >= 0),
  total_price numeric not null check (total_price >= 0),
  payment_method text,
  receipt_path text,
  receipt_name text,
  remarks text,
  -- only when the Admin links it on purpose; never added to an event P&L automatically
  catering_event_id uuid references public.catering_events(id) on delete set null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists jdt_snack_purchases_company_idx on public.jdt_snack_purchases (company_id, purchase_date desc);

-- the fund: one initial RM500 allocation (once only) and any additional allocation approved by Management, each recorded apart
create table if not exists public.jdt_snack_fund_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  kind text not null check (kind in ('initial','additional')),
  amount numeric not null check (amount > 0),
  purpose text not null default 'JDT II Snacks and Training Refreshments',
  payment_type text not null default 'One-Time Payment',
  received boolean not null default false,
  received_date date,
  received_reference text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  approval_status text not null default 'approved' check (approval_status in ('pending','approved','rejected')),
  requested_by uuid references auth.users(id) default auth.uid(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists jdt_snack_fund_one_initial on public.jdt_snack_fund_allocations (company_id) where kind = 'initial';

alter table public.jdt_snack_requests enable row level security;
alter table public.jdt_snack_items enable row level security;
alter table public.jdt_snack_purchases enable row level security;
alter table public.jdt_snack_fund_allocations enable row level security;

drop policy if exists jdt_snack_requests_select on public.jdt_snack_requests;
create policy jdt_snack_requests_select on public.jdt_snack_requests for select using (company_id in (select public.user_company_ids()));
drop policy if exists jdt_snack_requests_insert on public.jdt_snack_requests;
create policy jdt_snack_requests_insert on public.jdt_snack_requests for insert with check (company_id in (select public.user_company_ids()) and public.user_can_handle_snacks(company_id));
drop policy if exists jdt_snack_requests_update on public.jdt_snack_requests;
create policy jdt_snack_requests_update on public.jdt_snack_requests for update using (company_id in (select public.user_company_ids()) and public.user_can_handle_snacks(company_id));

drop policy if exists jdt_snack_items_select on public.jdt_snack_items;
create policy jdt_snack_items_select on public.jdt_snack_items for select using (exists (select 1 from public.jdt_snack_requests r where r.id = request_id and r.company_id in (select public.user_company_ids())));
drop policy if exists jdt_snack_items_write on public.jdt_snack_items;
create policy jdt_snack_items_write on public.jdt_snack_items for all
  using (exists (select 1 from public.jdt_snack_requests r where r.id = request_id and r.company_id in (select public.user_company_ids()) and public.user_can_handle_snacks(r.company_id)))
  with check (exists (select 1 from public.jdt_snack_requests r where r.id = request_id and r.company_id in (select public.user_company_ids()) and public.user_can_handle_snacks(r.company_id)));

drop policy if exists jdt_snack_purchases_all on public.jdt_snack_purchases;
create policy jdt_snack_purchases_all on public.jdt_snack_purchases for all
  using (company_id in (select public.user_company_ids()) and public.user_can_handle_snacks(company_id))
  with check (company_id in (select public.user_company_ids()) and public.user_can_handle_snacks(company_id));

drop policy if exists jdt_snack_fund_select on public.jdt_snack_fund_allocations;
create policy jdt_snack_fund_select on public.jdt_snack_fund_allocations for select using (company_id in (select public.user_company_ids()) and public.user_can_handle_snacks(company_id));
drop policy if exists jdt_snack_fund_insert on public.jdt_snack_fund_allocations;
create policy jdt_snack_fund_insert on public.jdt_snack_fund_allocations for insert with check (company_id in (select public.user_company_ids()) and public.user_can_handle_snacks(company_id));
drop policy if exists jdt_snack_fund_update on public.jdt_snack_fund_allocations;
create policy jdt_snack_fund_update on public.jdt_snack_fund_allocations for update using (company_id in (select public.user_company_ids()) and public.user_can_handle_snacks(company_id));

-- an additional allocation is approved (or rejected) only by Management (a company admin)
create or replace function public.jdt_snack_fund_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'additional' then
      new.approval_status := 'pending'; new.approved_by := null; new.approved_at := null;
    end if;
  elsif new.approval_status is distinct from old.approval_status then
    if not public.user_is_company_admin(new.company_id) then
      raise exception 'Only Management can approve or reject an additional allocation.';
    end if;
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  if new.received and (tg_op = 'INSERT' or not old.received) then
    new.verified_by := auth.uid(); new.verified_at := now();
  end if;
  return new;
end $$;
drop trigger if exists jdt_snack_fund_guard on public.jdt_snack_fund_allocations;
create trigger jdt_snack_fund_guard before insert or update on public.jdt_snack_fund_allocations for each row execute function public.jdt_snack_fund_guard();

drop trigger if exists jdt_snack_requests_set_updated_at on public.jdt_snack_requests;
create trigger jdt_snack_requests_set_updated_at before update on public.jdt_snack_requests for each row execute function public.set_updated_at();
drop trigger if exists jdt_snack_items_set_updated_at on public.jdt_snack_items;
create trigger jdt_snack_items_set_updated_at before update on public.jdt_snack_items for each row execute function public.set_updated_at();
drop trigger if exists jdt_snack_fund_set_updated_at on public.jdt_snack_fund_allocations;
create trigger jdt_snack_fund_set_updated_at before update on public.jdt_snack_fund_allocations for each row execute function public.set_updated_at();

alter table public.whatsapp_imports drop constraint if exists whatsapp_imports_snack_request_fk;
alter table public.whatsapp_imports add constraint whatsapp_imports_snack_request_fk foreign key (snack_request_id) references public.jdt_snack_requests(id) on delete set null;

-- the initial RM500, recorded as NOT yet received (the Admin marks it received once the payment is verified)
insert into public.jdt_snack_fund_allocations (company_id, kind, amount, received, remarks, requested_by)
select 'bf86ef51-fc00-4331-aef6-a0deaee07183', 'initial', 500, false, 'One-time allocation for JDT II snacks and training refreshments. Not RM500 per training, not monthly.', null
where not exists (select 1 from public.jdt_snack_fund_allocations where company_id = 'bf86ef51-fc00-4331-aef6-a0deaee07183' and kind = 'initial');

-- receipts: a private bucket; files are opened through short-lived links made on the server
insert into storage.buckets (id, name, public) values ('snack-receipts', 'snack-receipts', false) on conflict (id) do nothing;
drop policy if exists snack_receipts_rw on storage.objects;
create policy snack_receipts_rw on storage.objects for all to authenticated
  using (bucket_id = 'snack-receipts' and public.user_can_handle_snacks('bf86ef51-fc00-4331-aef6-a0deaee07183'))
  with check (bucket_id = 'snack-receipts' and public.user_can_handle_snacks('bf86ef51-fc00-4331-aef6-a0deaee07183'));
