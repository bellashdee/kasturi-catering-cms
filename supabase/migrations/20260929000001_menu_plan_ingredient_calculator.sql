-- Kitchen menu-plan structure for the Ingredient Calculator: Menu Category
-- (UTM/JDT2/JDT3/JDT4) -> Week (1-14) -> Meal (breakfast/lunch/dinner) ->
-- Dish -> Ingredient. Separate from the existing `menus`/`menu_items`
-- tables (a different, pre-existing Kitchen feature) so nothing there is
-- touched or duplicated.
create table if not exists menu_plan_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists menu_plan_weeks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  category_id uuid not null references menu_plan_categories(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 14),
  created_at timestamptz not null default now(),
  unique (category_id, week_number)
);

create table if not exists menu_plan_meals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  week_id uuid not null references menu_plan_weeks(id) on delete cascade,
  meal_time text not null check (meal_time in ('breakfast','lunch','dinner')),
  created_at timestamptz not null default now(),
  unique (week_id, meal_time)
);

create table if not exists menu_plan_dishes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  meal_id uuid not null references menu_plan_meals(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists menu_plan_ingredients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  dish_id uuid not null references menu_plan_dishes(id) on delete cascade,
  name text not null,
  base_quantity numeric,
  base_pax integer not null,
  unit text,
  reference_quantity numeric,
  reference_pax integer,
  remark text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists menu_plan_weeks_category_idx on menu_plan_weeks(category_id);
create index if not exists menu_plan_meals_week_idx on menu_plan_meals(week_id);
create index if not exists menu_plan_dishes_meal_idx on menu_plan_dishes(meal_id);
create index if not exists menu_plan_ingredients_dish_idx on menu_plan_ingredients(dish_id);
create index if not exists menu_plan_categories_company_idx on menu_plan_categories(company_id);
create index if not exists menu_plan_weeks_company_idx on menu_plan_weeks(company_id);
create index if not exists menu_plan_meals_company_idx on menu_plan_meals(company_id);
create index if not exists menu_plan_dishes_company_idx on menu_plan_dishes(company_id);
create index if not exists menu_plan_ingredients_company_idx on menu_plan_ingredients(company_id);

alter table menu_plan_categories enable row level security;
alter table menu_plan_weeks enable row level security;
alter table menu_plan_meals enable row level security;
alter table menu_plan_dishes enable row level security;
alter table menu_plan_ingredients enable row level security;

create policy menu_plan_categories_all on menu_plan_categories for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));
create policy menu_plan_weeks_all on menu_plan_weeks for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));
create policy menu_plan_meals_all on menu_plan_meals for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));
create policy menu_plan_dishes_all on menu_plan_dishes for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));
create policy menu_plan_ingredients_all on menu_plan_ingredients for all using (user_has_company_access(company_id)) with check (user_has_company_access(company_id));
