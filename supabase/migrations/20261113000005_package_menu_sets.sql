-- Package menus can belong to a fixed menu set (Signature Solution: JDT 2, JDT 3, JDT 4, JDT UTM) and keep their order; each dish can
-- point at its exact recipe, so the pax calculator uses the recipe of that menu (several recipes share a dish name).
alter table public.package_menus add column if not exists menu_set text;
alter table public.package_menus add column if not exists sort_order integer not null default 0;
alter table public.package_menu_items add column if not exists recipe_id uuid references public.recipes(id) on delete set null;
