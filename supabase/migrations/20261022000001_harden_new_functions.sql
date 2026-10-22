-- Housekeeping from the security advisor: fixed search_path on the two new trigger functions; the payroll access check is for signed-in users only.
alter function public.payroll_records_touch() set search_path = '';
alter function public.bulletin_posts_touch() set search_path = '';
revoke execute on function public.user_can_use_payroll_centre() from anon, public;
grant execute on function public.user_can_use_payroll_centre() to authenticated;
