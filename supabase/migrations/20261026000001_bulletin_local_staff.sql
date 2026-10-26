-- Bulletin board: every local (Malaysian) staff member with a login may post, edit and delete announcements, for all companies or for a company they
-- can open. Super Admins and Company Admins keep what they could do. Everybody can still read.
create or replace function public.user_is_local_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.user_id = auth.uid() and e.status = 'active' and e.nationality ilike 'malay%'
  );
$$;
revoke execute on function public.user_is_local_staff() from anon, public;
grant execute on function public.user_is_local_staff() to authenticated;

drop policy if exists bulletin_posts_insert on public.bulletin_posts;
create policy bulletin_posts_insert on public.bulletin_posts for insert to authenticated
  with check (
    case when company_id is null then public.current_user_is_super_admin() else public.user_is_company_admin(company_id) end
    or (public.user_is_local_staff() and (company_id is null or public.user_has_company_access(company_id)))
  );

drop policy if exists bulletin_posts_update on public.bulletin_posts;
create policy bulletin_posts_update on public.bulletin_posts for update to authenticated
  using (
    case when company_id is null then public.current_user_is_super_admin() else public.user_is_company_admin(company_id) end
    or (public.user_is_local_staff() and (company_id is null or public.user_has_company_access(company_id)))
  )
  with check (
    case when company_id is null then public.current_user_is_super_admin() else public.user_is_company_admin(company_id) end
    or (public.user_is_local_staff() and (company_id is null or public.user_has_company_access(company_id)))
  );

drop policy if exists bulletin_posts_delete on public.bulletin_posts;
create policy bulletin_posts_delete on public.bulletin_posts for delete to authenticated
  using (
    case when company_id is null then public.current_user_is_super_admin() else public.user_is_company_admin(company_id) end
    or (public.user_is_local_staff() and (company_id is null or public.user_has_company_access(company_id)))
  );
