-- Which supplier item each ingredient is bought as (chosen by a person, remembered for the next purchase list). Per company.
create table if not exists public.ingredient_supplier_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ingredient_key text not null,
  ingredient_name text not null,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  item_description text not null,
  uom text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, ingredient_key)
);
alter table public.ingredient_supplier_matches enable row level security;
create policy ingredient_supplier_matches_all on public.ingredient_supplier_matches
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
create index if not exists ingredient_supplier_matches_company_idx on public.ingredient_supplier_matches (company_id);
