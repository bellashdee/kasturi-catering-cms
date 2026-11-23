-- Restaurant system: day totals imported from the FeedMe POS (Report > Overview > Download > Excel). O2 Life only. Additive.
-- A FeedMe overview file has NO split by channel or payment method, so a day from FeedMe is its own table (rst_sales_day_totals), not a line of
-- rst_sales_daily (whose channel and payment method are required). The figures are kept exactly as the file gives them (discount is negative).
-- Rules: one row per source + date + outlet (importing the same file twice creates nothing); nothing is overwritten or deleted by an import;
-- an imported day starts as a draft and is confirmed by a person with a sales role; a confirmed day is never edited, only cancelled with a reason.

create table if not exists public.rst_sales_day_totals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source text not null check (source in ('feedme_overview')),
  sales_date date not null,
  outlet text not null check (btrim(outlet) <> ''),
  bills integer not null check (bills >= 0),
  pax integer check (pax is null or pax >= 0),
  gross numeric(12,2) not null check (gross >= 0),
  discount numeric(12,2) not null default 0 check (discount <= 0),
  service_charge numeric(12,2) not null default 0,
  sst numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  rounding numeric(12,2) not null default 0,
  nett numeric(12,2) not null,
  source_file text,
  manual_lines_ack numeric(12,2),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  cancel_reason text,
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rst_sales_day_totals_once on public.rst_sales_day_totals (company_id, source, sales_date, outlet) where status <> 'cancelled';
create index if not exists rst_sales_day_totals_company_date_idx on public.rst_sales_day_totals (company_id, sales_date);

create or replace function public.rst_sales_day_totals_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.created_by := auth.uid();
    new.confirmed_by := null; new.confirmed_at := null; new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;
    if not public.rst_is_restaurant(new.company_id) then
      raise exception 'Day totals are only for the restaurant company.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'A confirmed or cancelled day total cannot be deleted. Cancel it with a reason instead.';
    end if;
    return old;
  end if;

  if new.company_id <> old.company_id then raise exception 'The company of a day total cannot be changed.'; end if;
  if (new.source, new.sales_date, new.outlet, new.bills, new.pax, new.gross, new.discount, new.service_charge, new.sst, new.delivery_fee, new.rounding, new.nett)
     is distinct from (old.source, old.sales_date, old.outlet, old.bills, old.pax, old.gross, old.discount, old.service_charge, old.sst, old.delivery_fee, old.rounding, old.nett) then
    raise exception 'The figures of an imported day cannot be edited. Delete the draft, or cancel the confirmed day with a reason, and import again.';
  end if;
  new.updated_at := now();

  if old.status = 'cancelled' then
    raise exception 'A cancelled day total cannot be changed.';
  elsif old.status = 'confirmed' then
    if new.status <> 'cancelled' then
      raise exception 'A confirmed day total cannot be changed. Cancel it with a reason.';
    end if;
    if not public.rst_has_role(old.company_id, array['manager']) then
      raise exception 'Only a Manager or an Admin can cancel a confirmed day total.';
    end if;
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'Write the reason for cancelling.';
    end if;
    new.cancelled_by := auth.uid();
    new.cancelled_at := now();
  else
    if new.status = 'confirmed' then
      new.confirmed_by := auth.uid();
      new.confirmed_at := now();
    elsif new.status = 'cancelled' then
      raise exception 'A draft day total is deleted, not cancelled.';
    end if;
  end if;
  return new;
end;
$$;

create trigger rst_sales_day_totals_guard_trg before insert or update or delete on public.rst_sales_day_totals
  for each row execute function public.rst_sales_day_totals_guard();
create trigger rst_sales_day_totals_audit_trg after insert or update or delete on public.rst_sales_day_totals
  for each row execute function public.rst_audit();

alter table public.rst_sales_day_totals enable row level security;

create policy rst_sales_day_totals_select on public.rst_sales_day_totals for select to authenticated
  using (company_id in (select public.user_company_ids()));
create policy rst_sales_day_totals_insert on public.rst_sales_day_totals for insert to authenticated
  with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_sales_day_totals_update on public.rst_sales_day_totals for update to authenticated
  using (public.rst_has_role(company_id, array['cashier', 'manager', 'finance']))
  with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_sales_day_totals_delete on public.rst_sales_day_totals for delete to authenticated
  using (status = 'draft' and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_sales_day_totals_module_gate on public.rst_sales_day_totals as restrictive for all to authenticated
  using (company_id in (select public.user_module_company_ids('restaurant')))
  with check (company_id in (select public.user_module_company_ids('restaurant')));
