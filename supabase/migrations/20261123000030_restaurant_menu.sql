-- Restaurant system, phase 2 (O2 Life only): menu, recipes with versions and cost per portion. Additive. No stock is touched.
-- The restaurant has its OWN costing list (rst_ingredients) and its own recipe tables, so nothing appears in the Stock tab and the catering recipes
-- (recipes / recipe_ingredients / ingredients of Kasturi Indah and Signature Solution) are not touched. Phase 3 can link a costing ingredient to a
-- stock ingredient.
-- Rules: a menu item / ingredient / category is never deleted (deactivate it); a recipe change is a NEW VERSION; an approved version and its lines are
-- frozen (each line keeps the ingredient name, unit cost and yield it was costed with, so old costs stay readable); a Manager or an Admin approves, and
-- nobody approves their own version except an Admin; only a Manager or an Admin sets a price. Every change is written to audit_events with before / after.

-- ------------------------------------------------------------ categories
create table if not exists public.rst_menu_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rst_menu_categories_name_once on public.rst_menu_categories (company_id, lower(name));

-- ------------------------------------------------------------ menu items
create table if not exists public.rst_menu_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  category_id uuid references public.rst_menu_categories(id),
  -- the menu price BEFORE service charge and SST (FeedMe adds the service charge on the bill); null = not set yet
  price numeric(10,2) check (price is null or price >= 0),
  station text check (station is null or station in ('grill', 'frying', 'hot_kitchen', 'rice_side', 'drinks', 'packing')),
  prep_minutes integer check (prep_minutes is null or prep_minutes between 0 and 600),
  portion_text text,
  -- the name of the product in FeedMe (so the sales per item can be matched later)
  feedme_name text check (feedme_name is null or btrim(feedme_name) <> ''),
  is_available boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rst_menu_items_code_once on public.rst_menu_items (company_id, lower(code));
create unique index if not exists rst_menu_items_feedme_once on public.rst_menu_items (company_id, lower(feedme_name)) where feedme_name is not null;
create index if not exists rst_menu_items_company_idx on public.rst_menu_items (company_id, is_active);

-- variants (a size, a cooking style) and add-ons (extra rice, a drink) of a menu item
create table if not exists public.rst_menu_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  menu_item_id uuid not null references public.rst_menu_items(id),
  kind text not null check (kind in ('variant', 'addon')),
  name text not null check (btrim(name) <> ''),
  price_delta numeric(10,2) not null default 0 check (price_delta between -9999 and 9999),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rst_menu_options_once on public.rst_menu_options (menu_item_id, kind, lower(name));

-- ------------------------------------------------------------ costing ingredients
create table if not exists public.rst_ingredients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  -- the unit the price is for (kg, g, l, ml, pcs, pack, carton, bottle, tray, bag ...)
  unit text not null check (btrim(unit) <> ''),
  unit_cost numeric(12,4) check (unit_cost is null or unit_cost >= 0),
  -- the share that is usable after cleaning (a whole fish bought by the kg: about 55 to 65 %); the cost of the usable part is price / yield
  yield_pct numeric(5,2) not null default 100 check (yield_pct > 0 and yield_pct <= 100),
  is_seafood boolean not null default false,
  price_source text not null default 'typed' check (price_source in ('typed', 'suggestion')),
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rst_ingredients_name_once on public.rst_ingredients (company_id, lower(name));

-- ------------------------------------------------------------ recipes and their versions
create table if not exists public.rst_recipes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  menu_item_id uuid not null unique references public.rst_menu_items(id),
  current_version_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.rst_recipe_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recipe_id uuid not null references public.rst_recipes(id),
  version_no integer not null check (version_no >= 1),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  -- how many portions this recipe makes (1 for a dish made to order)
  portion_yield numeric(10,3) not null default 1 check (portion_yield > 0),
  portion_text text,
  instructions text,
  change_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  unique (recipe_id, version_no)
);
alter table public.rst_recipes add constraint rst_recipes_current_version_fk foreign key (current_version_id) references public.rst_recipe_versions(id);

create table if not exists public.rst_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  version_id uuid not null references public.rst_recipe_versions(id) on delete cascade,
  line_no integer not null,
  ingredient_id uuid references public.rst_ingredients(id),
  -- what the ingredient was when this version was made: the version keeps its own cost
  ingredient_name text not null,
  quantity numeric(12,4) not null check (quantity > 0),
  unit text not null check (btrim(unit) <> ''),
  waste_pct numeric(5,2) not null default 0 check (waste_pct >= 0 and waste_pct < 90),
  unit_cost numeric(12,4) check (unit_cost is null or unit_cost >= 0),
  cost_unit text,
  yield_pct numeric(5,2) not null default 100 check (yield_pct > 0 and yield_pct <= 100),
  note text,
  unique (version_id, line_no)
);

-- ------------------------------------------------------------ guards
create or replace function public.rst_menu_categories_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then raise exception 'A category is never deleted. Deactivate it.'; end if;
  if tg_op = 'INSERT' and not public.rst_is_restaurant(new.company_id) then raise exception 'The menu is only for the restaurant company.'; end if;
  if tg_op = 'UPDATE' then
    if new.company_id <> old.company_id then raise exception 'The company cannot be changed.'; end if;
    new.updated_at := now();
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

create or replace function public.rst_menu_items_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then raise exception 'A menu item is never deleted. Deactivate it.'; end if;
  if tg_op = 'INSERT' then
    if not public.rst_is_restaurant(new.company_id) then raise exception 'The menu is only for the restaurant company.'; end if;
    new.created_by := auth.uid();
    if new.price is not null and not public.rst_has_role(new.company_id, array['manager']) then raise exception 'Only a Manager or an Admin can set a price.'; end if;
  else
    if new.company_id <> old.company_id then raise exception 'The company cannot be changed.'; end if;
    if new.price is distinct from old.price and not public.rst_has_role(new.company_id, array['manager']) then raise exception 'Only a Manager or an Admin can change a price.'; end if;
    new.updated_at := now();
  end if;
  new.code := btrim(new.code);
  new.name := btrim(new.name);
  new.feedme_name := nullif(btrim(coalesce(new.feedme_name, '')), '');
  return new;
end;
$$;

create or replace function public.rst_menu_options_guard()
returns trigger language plpgsql set search_path to 'public' as $$
declare item_company uuid;
begin
  if tg_op = 'DELETE' then raise exception 'An option is never deleted. Deactivate it.'; end if;
  select company_id into item_company from public.rst_menu_items where id = new.menu_item_id;
  if item_company is null or item_company <> new.company_id then raise exception 'The option and its menu item must be of the same company.'; end if;
  if tg_op = 'INSERT' then
    if new.price_delta <> 0 and not public.rst_has_role(new.company_id, array['manager']) then raise exception 'Only a Manager or an Admin can set a price.'; end if;
  else
    if new.menu_item_id <> old.menu_item_id then raise exception 'An option cannot move to another menu item.'; end if;
    if new.price_delta <> old.price_delta and not public.rst_has_role(new.company_id, array['manager']) then raise exception 'Only a Manager or an Admin can change a price.'; end if;
    new.updated_at := now();
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

create or replace function public.rst_ingredients_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then raise exception 'An ingredient is never deleted. Deactivate it.'; end if;
  if tg_op = 'INSERT' then
    if not public.rst_is_restaurant(new.company_id) then raise exception 'The costing list is only for the restaurant company.'; end if;
    new.created_by := auth.uid();
  else
    if new.company_id <> old.company_id then raise exception 'The company cannot be changed.'; end if;
    new.updated_at := now();
  end if;
  new.name := btrim(new.name);
  new.unit := lower(btrim(new.unit));
  return new;
end;
$$;

create or replace function public.rst_recipes_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then raise exception 'A recipe is never deleted.'; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.current_version_id := null;
    return new;
  end if;
  if new.menu_item_id <> old.menu_item_id or new.company_id <> old.company_id then raise exception 'A recipe cannot move to another menu item.'; end if;
  if new.current_version_id is distinct from old.current_version_id then
    if new.current_version_id is null or not exists (select 1 from public.rst_recipe_versions v where v.id = new.current_version_id and v.recipe_id = new.id and v.status = 'approved') then
      raise exception 'The current version must be an approved version of this recipe.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.rst_recipe_versions_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.status := 'draft';
    new.approved_by := null; new.approved_at := null;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'An approved version is never deleted.'; end if;
    return old;
  end if;
  if old.status = 'approved' then raise exception 'An approved version cannot be changed. Make a new version.'; end if;
  if new.recipe_id <> old.recipe_id or new.version_no <> old.version_no or new.company_id <> old.company_id then raise exception 'The version cannot be moved.'; end if;
  if new.status = 'approved' then
    if not public.rst_has_role(old.company_id, array['manager']) then raise exception 'Only a Manager or an Admin can approve a recipe.'; end if;
    if old.created_by is not distinct from auth.uid() and not public.user_is_company_admin(old.company_id) then raise exception 'You cannot approve your own version. Another Manager or an Admin approves it.'; end if;
    if not exists (select 1 from public.rst_recipe_lines l where l.version_id = old.id) then raise exception 'A version without ingredients cannot be approved.'; end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  else
    new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.rst_recipe_lines_guard()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_status text; v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.version_id else new.version_id end;
  select status into v_status from public.rst_recipe_versions where id = v_id;
  -- when the whole version is removed the lines go with it (cascade): a draft only
  if v_status is null then return coalesce(new, old); end if;
  if v_status <> 'draft' then raise exception 'The ingredients of an approved version cannot be changed. Make a new version.'; end if;
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.waste_pct < 0 or new.waste_pct >= 90 then raise exception 'The waste percentage must be from 0 to 89.'; end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger rst_menu_categories_guard_trg before insert or update or delete on public.rst_menu_categories for each row execute function public.rst_menu_categories_guard();
create trigger rst_menu_items_guard_trg before insert or update or delete on public.rst_menu_items for each row execute function public.rst_menu_items_guard();
create trigger rst_menu_options_guard_trg before insert or update or delete on public.rst_menu_options for each row execute function public.rst_menu_options_guard();
create trigger rst_ingredients_guard_trg before insert or update or delete on public.rst_ingredients for each row execute function public.rst_ingredients_guard();
create trigger rst_recipes_guard_trg before insert or update or delete on public.rst_recipes for each row execute function public.rst_recipes_guard();
create trigger rst_recipe_versions_guard_trg before insert or update or delete on public.rst_recipe_versions for each row execute function public.rst_recipe_versions_guard();
create trigger rst_recipe_lines_guard_trg before insert or update or delete on public.rst_recipe_lines for each row execute function public.rst_recipe_lines_guard();

create trigger rst_menu_categories_audit_trg after insert or update or delete on public.rst_menu_categories for each row execute function public.rst_audit();
create trigger rst_menu_items_audit_trg after insert or update or delete on public.rst_menu_items for each row execute function public.rst_audit();
create trigger rst_menu_options_audit_trg after insert or update or delete on public.rst_menu_options for each row execute function public.rst_audit();
create trigger rst_ingredients_audit_trg after insert or update or delete on public.rst_ingredients for each row execute function public.rst_audit();
create trigger rst_recipes_audit_trg after insert or update or delete on public.rst_recipes for each row execute function public.rst_audit();
create trigger rst_recipe_versions_audit_trg after insert or update or delete on public.rst_recipe_versions for each row execute function public.rst_audit();
create trigger rst_recipe_lines_audit_trg after insert or update or delete on public.rst_recipe_lines for each row execute function public.rst_audit();

-- ------------------------------------------------------------ row level security
alter table public.rst_menu_categories enable row level security;
alter table public.rst_menu_items enable row level security;
alter table public.rst_menu_options enable row level security;
alter table public.rst_ingredients enable row level security;
alter table public.rst_recipes enable row level security;
alter table public.rst_recipe_versions enable row level security;
alter table public.rst_recipe_lines enable row level security;

create policy rst_menu_categories_select on public.rst_menu_categories for select to authenticated using (company_id in (select public.user_company_ids()));
create policy rst_menu_categories_insert on public.rst_menu_categories for insert to authenticated with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['manager', 'chef']));
create policy rst_menu_categories_update on public.rst_menu_categories for update to authenticated using (public.rst_has_role(company_id, array['manager', 'chef'])) with check (public.rst_has_role(company_id, array['manager', 'chef']));

create policy rst_menu_items_select on public.rst_menu_items for select to authenticated using (company_id in (select public.user_company_ids()));
create policy rst_menu_items_insert on public.rst_menu_items for insert to authenticated with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['manager', 'chef']));
create policy rst_menu_items_update on public.rst_menu_items for update to authenticated using (public.rst_has_role(company_id, array['manager', 'chef'])) with check (public.rst_has_role(company_id, array['manager', 'chef']));

create policy rst_menu_options_select on public.rst_menu_options for select to authenticated using (company_id in (select public.user_company_ids()));
create policy rst_menu_options_insert on public.rst_menu_options for insert to authenticated with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['manager', 'chef']));
create policy rst_menu_options_update on public.rst_menu_options for update to authenticated using (public.rst_has_role(company_id, array['manager', 'chef'])) with check (public.rst_has_role(company_id, array['manager', 'chef']));

create policy rst_ingredients_select on public.rst_ingredients for select to authenticated using (company_id in (select public.user_company_ids()));
create policy rst_ingredients_insert on public.rst_ingredients for insert to authenticated with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['manager', 'chef', 'purchasing']));
create policy rst_ingredients_update on public.rst_ingredients for update to authenticated using (public.rst_has_role(company_id, array['manager', 'chef', 'purchasing'])) with check (public.rst_has_role(company_id, array['manager', 'chef', 'purchasing']));

create policy rst_recipes_select on public.rst_recipes for select to authenticated using (company_id in (select public.user_company_ids()));
create policy rst_recipes_insert on public.rst_recipes for insert to authenticated with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['manager', 'chef']));
create policy rst_recipes_update on public.rst_recipes for update to authenticated using (public.rst_has_role(company_id, array['manager'])) with check (public.rst_has_role(company_id, array['manager']));

create policy rst_recipe_versions_select on public.rst_recipe_versions for select to authenticated using (company_id in (select public.user_company_ids()));
create policy rst_recipe_versions_insert on public.rst_recipe_versions for insert to authenticated with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['manager', 'chef']));
create policy rst_recipe_versions_update on public.rst_recipe_versions for update to authenticated using (public.rst_has_role(company_id, array['manager', 'chef'])) with check (public.rst_has_role(company_id, array['manager', 'chef']));
create policy rst_recipe_versions_delete on public.rst_recipe_versions for delete to authenticated using (status = 'draft' and public.rst_has_role(company_id, array['manager', 'chef']));

create policy rst_recipe_lines_select on public.rst_recipe_lines for select to authenticated using (company_id in (select public.user_company_ids()));
create policy rst_recipe_lines_insert on public.rst_recipe_lines for insert to authenticated with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['manager', 'chef']));
create policy rst_recipe_lines_update on public.rst_recipe_lines for update to authenticated using (public.rst_has_role(company_id, array['manager', 'chef'])) with check (public.rst_has_role(company_id, array['manager', 'chef']));
create policy rst_recipe_lines_delete on public.rst_recipe_lines for delete to authenticated using (public.rst_has_role(company_id, array['manager', 'chef']));

create policy rst_menu_categories_module_gate on public.rst_menu_categories as restrictive for all to authenticated using (company_id in (select public.user_module_company_ids('restaurant'))) with check (company_id in (select public.user_module_company_ids('restaurant')));
create policy rst_menu_items_module_gate on public.rst_menu_items as restrictive for all to authenticated using (company_id in (select public.user_module_company_ids('restaurant'))) with check (company_id in (select public.user_module_company_ids('restaurant')));
create policy rst_menu_options_module_gate on public.rst_menu_options as restrictive for all to authenticated using (company_id in (select public.user_module_company_ids('restaurant'))) with check (company_id in (select public.user_module_company_ids('restaurant')));
create policy rst_ingredients_module_gate on public.rst_ingredients as restrictive for all to authenticated using (company_id in (select public.user_module_company_ids('restaurant'))) with check (company_id in (select public.user_module_company_ids('restaurant')));
create policy rst_recipes_module_gate on public.rst_recipes as restrictive for all to authenticated using (company_id in (select public.user_module_company_ids('restaurant'))) with check (company_id in (select public.user_module_company_ids('restaurant')));
create policy rst_recipe_versions_module_gate on public.rst_recipe_versions as restrictive for all to authenticated using (company_id in (select public.user_module_company_ids('restaurant'))) with check (company_id in (select public.user_module_company_ids('restaurant')));
create policy rst_recipe_lines_module_gate on public.rst_recipe_lines as restrictive for all to authenticated using (company_id in (select public.user_module_company_ids('restaurant'))) with check (company_id in (select public.user_module_company_ids('restaurant')));

-- ------------------------------------------------------------ one step: save a recipe (draft) and approve a version
-- Saves the ingredient lines of a menu item. When the latest version is a draft it is changed in place; otherwise a NEW draft version is made
-- (the approved ones stay as they were). The cost of each line is taken from the costing list here, not from the browser.
create or replace function public.rst_save_recipe(p_menu_item uuid, p_payload jsonb)
returns uuid language plpgsql set search_path to 'public' as $$
declare
  mi public.rst_menu_items;
  r public.rst_recipes;
  v public.rst_recipe_versions;
  v_id uuid;
  l jsonb;
  ing public.rst_ingredients;
  i integer := 0;
  v_yield numeric := coalesce(nullif(p_payload ->> 'portion_yield', '')::numeric, 1);
  v_qty numeric;
  v_waste numeric;
begin
  select * into mi from public.rst_menu_items where id = p_menu_item for update;
  if not found then raise exception 'This menu item was not found.'; end if;
  if not public.rst_has_role(mi.company_id, array['manager', 'chef']) then raise exception 'Only a Chef, a Manager or an Admin can change a recipe.'; end if;
  if v_yield <= 0 then raise exception 'The recipe must make at least a part of one portion.'; end if;
  if jsonb_typeof(p_payload -> 'lines') <> 'array' or jsonb_array_length(p_payload -> 'lines') = 0 then raise exception 'Add at least one ingredient.'; end if;

  select * into r from public.rst_recipes where menu_item_id = p_menu_item;
  if not found then
    insert into public.rst_recipes (company_id, menu_item_id) values (mi.company_id, mi.id) returning * into r;
  end if;
  select * into v from public.rst_recipe_versions where recipe_id = r.id order by version_no desc limit 1;
  if found and v.status = 'draft' then
    update public.rst_recipe_versions
      set portion_yield = v_yield, portion_text = nullif(btrim(coalesce(p_payload ->> 'portion_text', '')), ''),
          instructions = nullif(btrim(coalesce(p_payload ->> 'instructions', '')), ''), change_note = nullif(btrim(coalesce(p_payload ->> 'change_note', '')), '')
      where id = v.id;
    delete from public.rst_recipe_lines where version_id = v.id;
    v_id := v.id;
  else
    insert into public.rst_recipe_versions (company_id, recipe_id, version_no, portion_yield, portion_text, instructions, change_note)
    values (mi.company_id, r.id, coalesce(v.version_no, 0) + 1, v_yield, nullif(btrim(coalesce(p_payload ->> 'portion_text', '')), ''),
            nullif(btrim(coalesce(p_payload ->> 'instructions', '')), ''), nullif(btrim(coalesce(p_payload ->> 'change_note', '')), ''))
    returning id into v_id;
  end if;

  for l in select value from jsonb_array_elements(p_payload -> 'lines') loop
    i := i + 1;
    select * into ing from public.rst_ingredients where id = (l ->> 'ingredient_id')::uuid and company_id = mi.company_id and is_active;
    if not found then raise exception 'Line %: choose an ingredient from the costing list.', i; end if;
    v_qty := (l ->> 'quantity')::numeric;
    v_waste := coalesce(nullif(l ->> 'waste_pct', '')::numeric, 0);
    if v_qty is null or v_qty <= 0 then raise exception 'Line %: enter the quantity.', i; end if;
    if coalesce(btrim(l ->> 'unit'), '') = '' then raise exception 'Line %: choose the unit.', i; end if;
    insert into public.rst_recipe_lines (company_id, version_id, line_no, ingredient_id, ingredient_name, quantity, unit, waste_pct, unit_cost, cost_unit, yield_pct, note)
    values (mi.company_id, v_id, i, ing.id, ing.name, v_qty, lower(btrim(l ->> 'unit')), v_waste, ing.unit_cost, ing.unit, ing.yield_pct, nullif(btrim(coalesce(l ->> 'note', '')), ''));
  end loop;
  return v_id;
end;
$$;

create or replace function public.rst_approve_recipe_version(p_version uuid)
returns uuid language plpgsql set search_path to 'public' as $$
declare v public.rst_recipe_versions;
begin
  select * into v from public.rst_recipe_versions where id = p_version for update;
  if not found then raise exception 'This version was not found.'; end if;
  if v.status = 'approved' then return v.id; end if;
  update public.rst_recipe_versions set status = 'approved' where id = p_version;
  update public.rst_recipes set current_version_id = p_version where id = v.recipe_id;
  return p_version;
end;
$$;

grant execute on function public.rst_save_recipe(uuid, jsonb) to authenticated;
grant execute on function public.rst_approve_recipe_version(uuid) to authenticated;

-- the usual categories of the restaurant (editable; they are not business data)
insert into public.rst_menu_categories (company_id, name, sort_order)
select c.id, v.name, v.ord
from public.companies c
cross join (values ('Fresh Seafood', 1), ('Fish', 2), ('Prawns', 3), ('Squid', 4), ('Shellfish', 5), ('Grilled', 6), ('Fried', 7), ('Vegetables', 8), ('Rice', 9), ('Drinks', 10), ('Set Meals', 11), ('Add-ons', 12)) as v(name, ord)
where c.is_restaurant
on conflict do nothing;
