alter table ingredients
  add column unit_cost numeric(12,2) not null default 0,
  add column preferred_supplier_id uuid references suppliers(id) on delete set null;

alter table production_orders
  add column recipe_id uuid,
  add column pax_count numeric(10,2),
  add column notes text;

create table menus (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  menu_id uuid not null references menus(id) on delete cascade,
  name text not null,
  category text not null default 'main' check (category in ('appetizer','main','side','dessert','beverage','other')),
  price_per_pax numeric(12,2),
  created_at timestamptz not null default now()
);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  name text not null,
  yield_pax numeric(10,2) not null default 1,
  instructions text,
  created_at timestamptz not null default now()
);

alter table production_orders
  add constraint production_orders_recipe_id_fkey foreign key (recipe_id) references recipes(id) on delete set null;

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity_per_yield numeric(12,3) not null,
  unit text
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  movement_type text not null check (movement_type in ('in','out','adjustment','wastage')),
  quantity numeric(12,3) not null,
  reference_type text,
  reference_id uuid,
  document_id uuid references documents(id) on delete set null,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table purchase_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  quantity_requested numeric(12,3) not null,
  unit text,
  status text not null default 'pending' check (status in ('pending','ordered','received','cancelled')),
  production_order_id uuid references production_orders(id) on delete set null,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
