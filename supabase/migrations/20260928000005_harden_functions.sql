create or replace function public.user_has_company_access(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and (uca.company_id = target_company_id or uca.company_id is null)
  );
$$;

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and uca.role = 'super_admin'
      and uca.company_id is null
  );
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.user_has_company_access(uuid) from anon;
revoke execute on function public.current_user_is_super_admin() from anon;
