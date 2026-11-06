-- Faster row level security, part 2: the line tables that are checked through their parent (recipe ingredients, purchase order
-- items, quotation items, supplier invoice items, supplier note items) use the company lists of 20261106000001 too, instead of a
-- function on every line. Same rows for every user (checked for 22 kinds of user). The parents' company_id is never empty.

do $$
declare
  p record;
  stmt text;
  fast text;
begin
  for p in
    select pol.schemaname, pol.tablename, pol.policyname, pol.qual, pol.with_check
    from pg_policies pol
    where pol.schemaname = 'public'
      and pol.tablename in ('purchase_order_items', 'quotation_items', 'recipe_ingredients', 'supplier_invoice_items', 'supplier_note_items')
      and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~ '(user_has_company_access|user_has_module)\(\w+\.company_id'
  loop
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then
      fast := regexp_replace(regexp_replace(p.qual,
        'user_has_company_access\((\w+)\.company_id\)', '(\1.company_id IN ( SELECT public.user_company_ids()))', 'g'),
        'user_has_module\((\w+)\.company_id, (''[^'']*''::text)\)', '(\1.company_id IN ( SELECT public.user_module_company_ids(\2)))', 'g');
      stmt := stmt || format(' using (%s)', fast);
    end if;
    if p.with_check is not null then
      fast := regexp_replace(regexp_replace(p.with_check,
        'user_has_company_access\((\w+)\.company_id\)', '(\1.company_id IN ( SELECT public.user_company_ids()))', 'g'),
        'user_has_module\((\w+)\.company_id, (''[^'']*''::text)\)', '(\1.company_id IN ( SELECT public.user_module_company_ids(\2)))', 'g');
      stmt := stmt || format(' with check (%s)', fast);
    end if;
    execute stmt;
  end loop;
end $$;
