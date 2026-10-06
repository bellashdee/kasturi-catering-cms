-- Only a company admin may link or unlink a login to a staff record or driver record.
-- (employees / driver_profiles are editable by any user of the company, so the link itself must be protected.)
create or replace function public.guard_login_link()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and new.user_id is distinct from (case when tg_op = 'UPDATE' then old.user_id else null end)
     and not public.user_is_company_admin(new.company_id) then
    raise exception 'Only an admin can link a login account to a staff or driver record.';
  end if;
  return new;
end;
$$;

create trigger employees_guard_login_link before insert or update on employees
  for each row execute function public.guard_login_link();
create trigger driver_profiles_guard_login_link before insert or update on driver_profiles
  for each row execute function public.guard_login_link();
