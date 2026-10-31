-- Total purchases per company per month (the AutoCount Monthly Purchase Analysis), to show next to the sales of the month.
create table public.monthly_purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  purchase_amount numeric(14,2) not null check (purchase_amount >= 0),
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, year, month)
);
create index monthly_purchases_company_idx on public.monthly_purchases (company_id);
alter table public.monthly_purchases enable row level security;
create policy monthly_purchases_read on public.monthly_purchases for select to authenticated using (public.user_has_company_access(company_id));
create policy monthly_purchases_insert on public.monthly_purchases for insert to authenticated with check (public.user_is_company_admin(company_id));
create policy monthly_purchases_update on public.monthly_purchases for update to authenticated using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));
create policy monthly_purchases_delete on public.monthly_purchases for delete to authenticated using (public.user_is_company_admin(company_id));

-- Kasturi Indah, Jan - Oct 2026 (total 267,372.65)
insert into public.monthly_purchases (company_id, year, month, purchase_amount, notes)
select c.id, 2026, v.m, v.amt, 'AutoCount Monthly Purchase Analysis, Jan - Oct 2026'
from public.companies c,
  (values (1, 3867.60), (2, 22268.82), (3, 21751.09), (4, 34083.23), (5, 11674.10), (6, 4512.16), (7, 33266.26), (8, 38613.65), (9, 52206.19), (10, 45129.55)) as v(m, amt)
where c.name = 'Kasturi Indah';
