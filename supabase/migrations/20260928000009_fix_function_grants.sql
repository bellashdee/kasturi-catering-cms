revoke execute on function public.user_has_company_access(uuid) from public;
revoke execute on function public.current_user_is_super_admin() from public;
grant execute on function public.user_has_company_access(uuid) to authenticated;
grant execute on function public.current_user_is_super_admin() to authenticated;
