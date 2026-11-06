-- Faster row level security: the companies a person may see are worked out once per query (a list), not once per row.
-- Same meaning as user_has_company_access / user_has_module / user_is_company_admin applied to a row's own company_id
-- (checked for 22 kinds of user on 85 tables: identical rows before and after). Applied 2026-11-06.
-- New tables: write their policies with these lists, e.g. using (company_id in (select public.user_company_ids())).

create or replace function public.user_company_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select c.id from public.companies c
  where exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and (uca.company_id = c.id or uca.company_id is null)
  );
$$;

create or replace function public.user_module_company_ids(module_key text)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select c.id from public.companies c
  where exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and (uca.company_id = c.id or uca.company_id is null)
      and (uca.allowed_modules is null or module_key = any (uca.allowed_modules))
  );
$$;

create or replace function public.user_admin_company_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select c.id from public.companies c
  where exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and uca.role in ('super_admin', 'company_admin')
      and (uca.company_id = c.id or uca.company_id is null)
  );
$$;

grant execute on function public.user_company_ids() to authenticated, anon;
grant execute on function public.user_module_company_ids(text) to authenticated, anon;
grant execute on function public.user_admin_company_ids() to authenticated, anon;

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
      and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~ '(user_has_company_access|user_has_module|user_is_company_admin)\(company_id'
      -- tables whose company_id may be empty keep their rules (an empty company is in no list)
      and not exists (
        select 1 from information_schema.columns c
        where c.table_schema = pol.schemaname and c.table_name = pol.tablename and c.column_name = 'company_id' and c.is_nullable = 'YES'
      )
  loop
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then
      fast := regexp_replace(regexp_replace(regexp_replace(p.qual,
        'user_has_company_access\(company_id\)', '(company_id IN ( SELECT public.user_company_ids()))', 'g'),
        'user_has_module\(company_id, (''[^'']*''::text)\)', '(company_id IN ( SELECT public.user_module_company_ids(\1)))', 'g'),
        'user_is_company_admin\(company_id\)', '(company_id IN ( SELECT public.user_admin_company_ids()))', 'g');
      stmt := stmt || format(' using (%s)', fast);
    end if;
    if p.with_check is not null then
      fast := regexp_replace(regexp_replace(regexp_replace(p.with_check,
        'user_has_company_access\(company_id\)', '(company_id IN ( SELECT public.user_company_ids()))', 'g'),
        'user_has_module\(company_id, (''[^'']*''::text)\)', '(company_id IN ( SELECT public.user_module_company_ids(\1)))', 'g'),
        'user_is_company_admin\(company_id\)', '(company_id IN ( SELECT public.user_admin_company_ids()))', 'g');
      stmt := stmt || format(' with check (%s)', fast);
    end if;
    execute stmt;
  end loop;
end $$;
