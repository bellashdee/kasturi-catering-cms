-- ingredients already has select policy (migration 004); add write access
create policy "ingredients_insert" on ingredients for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "ingredients_update" on ingredients for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table menus enable row level security;
create policy "menus_all" on menus for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table menu_items enable row level security;
create policy "menu_items_all" on menu_items for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table recipes enable row level security;
create policy "recipes_all" on recipes for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table recipe_ingredients enable row level security;
create policy "recipe_ingredients_all" on recipe_ingredients for all to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_ingredients.recipe_id and public.user_has_company_access(r.company_id)))
  with check (exists (select 1 from recipes r where r.id = recipe_ingredients.recipe_id and public.user_has_company_access(r.company_id)));

alter table stock_movements enable row level security;
create policy "stock_movements_all" on stock_movements for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table purchase_requests enable row level security;
create policy "purchase_requests_all" on purchase_requests for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
