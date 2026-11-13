-- Who is on approved leave between two dates, for the Bulletin Board, so everyone knows who is away that day.
-- Only the name, the company and the dates are shown (never the leave type or the reason), and only for the companies the person can see.

create or replace function public.staff_on_leave(from_date date, to_date date)
returns table (employee_name text, company_name text, start_date date, end_date date)
language sql stable security definer set search_path = public
as $$
  select coalesce(e.full_name, 'Staff') as employee_name, c.name as company_name, l.start_date, l.end_date
  from public.leave_requests l
  join public.employees e on e.id = l.employee_id
  join public.companies c on c.id = l.company_id
  where l.status = 'approved'
    and l.start_date <= to_date
    and l.end_date >= from_date
    and l.company_id in (select public.user_company_ids())
  order by l.start_date, e.full_name;
$$;

revoke execute on function public.staff_on_leave(date, date) from public, anon;
grant execute on function public.staff_on_leave(date, date) to authenticated;
