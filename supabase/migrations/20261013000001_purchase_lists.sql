-- Purchase List / Ingredient Calculator: a saved, consolidated shopping list for an event, built from the existing menu
-- plan (Signature Solution) and recipe (Kasturi Indah) data. Additive only: no existing table is changed. Calculated
-- quantities come from the menu data; the purchase quantity is editable separately and never touches the recipe.
create table purchase_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  event_name text not null check (length(btrim(event_name)) between 1 and 200),
  customer_name text,
  event_date date,
  meal_session text check (meal_session in ('breakfast', 'lunch', 'hi_tea', 'dinner', 'other')),
  required_pax integer not null check (required_pax > 0),
  catering_event_id uuid references catering_events(id) on delete set null,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_lists_company_idx on purchase_lists (company_id, event_date desc);

create table purchase_list_menus (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  purchase_list_id uuid not null references purchase_lists(id) on delete cascade,
  source_type text not null check (source_type in ('menu_plan', 'recipe')),
  source_id uuid not null,
  menu_label text not null,
  group_label text,
  sort_order integer not null default 0
);
create index purchase_list_menus_list_idx on purchase_list_menus (purchase_list_id);

create table purchase_list_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  purchase_list_id uuid not null references purchase_lists(id) on delete cascade,
  ingredient_name text not null,
  unit text,
  calculated_quantity numeric(14, 3) check (calculated_quantity is null or calculated_quantity >= 0),
  final_quantity numeric(14, 3) check (final_quantity is null or final_quantity >= 0),
  rounding_note text,
  stock_status text not null default 'not_checked' check (stock_status in ('not_checked', 'checked')),
  stock_available numeric(14, 3),
  supplier text,
  remark text,
  status text not null default 'pending' check (status in ('pending', 'ordered', 'purchased', 'received')),
  flags text[] not null default '{}',
  breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(breakdown) = 'array'),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create index purchase_list_items_list_idx on purchase_list_items (purchase_list_id, sort_order);
create index purchase_list_items_status_idx on purchase_list_items (company_id, status);

-- a menu line or item must belong to the same company as its purchase list
create or replace function purchase_list_child_company_check() returns trigger language plpgsql as $$
declare list_company uuid;
begin
  select company_id into list_company from purchase_lists where id = new.purchase_list_id;
  if list_company is null or list_company <> new.company_id then
    raise exception 'The company does not match the purchase list company.';
  end if;
  return new;
end $$;
create trigger purchase_list_menus_company_check before insert or update on purchase_list_menus
  for each row execute function purchase_list_child_company_check();
create trigger purchase_list_items_company_check before insert or update on purchase_list_items
  for each row execute function purchase_list_child_company_check();

alter table purchase_lists enable row level security;
alter table purchase_list_menus enable row level security;
alter table purchase_list_items enable row level security;

create policy "purchase_lists_all" on purchase_lists for all to authenticated
  using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
create policy "purchase_list_menus_all" on purchase_list_menus for all to authenticated
  using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
create policy "purchase_list_items_all" on purchase_list_items for all to authenticated
  using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
