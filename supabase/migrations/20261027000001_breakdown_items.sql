-- Monthly Breakdown: the items behind each cost line of a company's breakdown (raw item cost, labour / salary, utilities, contribution),
-- one row per item with its amount for each month of the year (amounts[1] = January ... amounts[12] = December; null = not entered yet).
-- Total sales of the breakdown stay in monthly_sales.
create table public.breakdown_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  line text not null check (line in ('raw', 'labour', 'utilities', 'contribution')),
  label text not null check (char_length(label) between 1 and 120),
  budget numeric(14,2) check (budget is null or budget >= 0),
  note text,
  amounts numeric(14,2)[] not null default array_fill(null::numeric, array[12]) check (array_length(amounts, 1) = 12),
  sort_order integer not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index breakdown_items_company_year_idx on public.breakdown_items (company_id, year, line, sort_order);

alter table public.breakdown_items enable row level security;

create policy breakdown_items_read on public.breakdown_items for select to authenticated
  using (public.user_has_company_access(company_id));
create policy breakdown_items_insert on public.breakdown_items for insert to authenticated
  with check (public.user_is_company_admin(company_id));
create policy breakdown_items_update on public.breakdown_items for update to authenticated
  using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));
create policy breakdown_items_delete on public.breakdown_items for delete to authenticated
  using (public.user_is_company_admin(company_id));
