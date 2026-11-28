-- Settings → Data Management (Super Admin only): Backup downloads every table as one Excel file; Restore puts back only the records of a
-- backup that are missing now. A record that exists is never changed (insert ... on conflict do nothing).
-- Only real tables with a primary key are covered (the backup_/bak_ snapshot tables have none).

-- The tables, their primary key, the columns that hold JSON or lists, the tables they point to (to restore parents first), and their size.
create or replace function public.backup_tables()
returns table (table_name text, pk_columns text[], json_columns text[], depends_on text[], row_count bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  if not public.current_user_is_super_admin() then
    raise exception 'Only a Super Admin can back up or restore the data.';
  end if;
  for r in
    select c.oid, c.relname::text as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')
    order by c.relname
  loop
    table_name := r.name;
    select array_agg(a.attname::text order by array_position(k.conkey, a.attnum))
      into pk_columns
      from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
      where k.conrelid = r.oid and k.contype = 'p';
    select coalesce(array_agg(a.attname::text order by a.attnum), '{}')
      into json_columns
      from pg_attribute a join pg_type t on t.oid = a.atttypid
      where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
        and (t.typname in ('json', 'jsonb') or t.typcategory = 'A');
    select coalesce(array_agg(distinct f.relname::text), '{}')
      into depends_on
      from pg_constraint k join pg_class f on f.oid = k.confrelid join pg_namespace fn on fn.oid = f.relnamespace
      where k.conrelid = r.oid and k.contype = 'f' and fn.nspname = 'public' and f.oid <> r.oid;
    execute format('select count(*) from public.%I', r.name) into row_count;
    return next;
  end loop;
end;
$$;

-- The rows of one table as JSON, in primary-key order, a page at a time.
create or replace function public.backup_rows(p_table text, p_offset integer, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  pk text;
  result jsonb;
begin
  if not public.current_user_is_super_admin() then
    raise exception 'Only a Super Admin can back up or restore the data.';
  end if;
  select string_agg(format('%I', a.attname), ', ' order by array_position(k.conkey, a.attnum))
    into pk
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
    where n.nspname = 'public' and c.relname = p_table and c.relkind = 'r' and k.contype = 'p';
  if pk is null then
    raise exception 'Unknown table: %', p_table;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select * from public.%I order by %s offset %s limit %s) x',
                 p_table, pk, greatest(p_offset, 0), least(greatest(p_limit, 1), 2000))
    into result;
  return result;
end;
$$;

-- Of the given rows (from a backup file), the ones whose primary key is not in the table now.
create or replace function public.restore_missing(p_table text, p_rows jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  match text;
  result jsonb;
begin
  if not public.current_user_is_super_admin() then
    raise exception 'Only a Super Admin can back up or restore the data.';
  end if;
  select string_agg(format('t.%1$I is not distinct from (jsonb_populate_record(null::public.%2$I, r)).%1$I', a.attname, p_table), ' and ')
    into match
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
    where n.nspname = 'public' and c.relname = p_table and c.relkind = 'r' and k.contype = 'p';
  if match is null then
    raise exception 'Unknown table: %', p_table;
  end if;
  execute format('select coalesce(jsonb_agg(r), ''[]''::jsonb) from jsonb_array_elements($1) r where not exists (select 1 from public.%I t where %s)',
                 p_table, match)
    using p_rows into result;
  return result;
end;
$$;

-- Puts the given rows back, one by one: a row whose key exists is left as it is; a row that cannot be put back yet (its parent record is
-- not back yet) is returned with the reason, so it can be tried again after the other tables. The automatic actions of the table (phone
-- notifications, mentions) are paused while this runs, so restoring old records does not notify anybody; the checks between records stay on.
create or replace function public.restore_insert(p_table text, p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  cols text;
  r jsonb;
  n integer;
  inserted integer := 0;
  failed jsonb := '[]'::jsonb;
begin
  if not public.current_user_is_super_admin() then
    raise exception 'Only a Super Admin can back up or restore the data.';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = p_table and c.relkind = 'r'
      and exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')
  ) then
    raise exception 'Unknown table: %', p_table;
  end if;
  -- the columns the backup can fill (not the ones the database works out itself)
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into cols
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = p_table and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';

  execute format('alter table public.%I disable trigger user', p_table);
  for r in select * from jsonb_array_elements(p_rows)
  loop
    begin
      execute format('insert into public.%1$I (%2$s) overriding system value select %2$s from jsonb_populate_record(null::public.%1$I, $1) on conflict do nothing',
                     p_table, cols)
        using r;
      get diagnostics n = row_count;
      inserted := inserted + n;
    exception when others then
      failed := failed || jsonb_build_array(jsonb_build_object('row', r, 'error', sqlerrm));
    end;
  end loop;
  execute format('alter table public.%I enable trigger user', p_table);
  return jsonb_build_object('inserted', inserted, 'failed', failed);
end;
$$;

revoke all on function public.backup_tables() from public, anon;
revoke all on function public.backup_rows(text, integer, integer) from public, anon;
revoke all on function public.restore_missing(text, jsonb) from public, anon;
revoke all on function public.restore_insert(text, jsonb) from public, anon;
grant execute on function public.backup_tables() to authenticated;
grant execute on function public.backup_rows(text, integer, integer) to authenticated;
grant execute on function public.restore_missing(text, jsonb) to authenticated;
grant execute on function public.restore_insert(text, jsonb) to authenticated;
