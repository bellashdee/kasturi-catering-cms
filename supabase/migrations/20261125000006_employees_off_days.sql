-- the staff member's weekly off day(s): 0 = Sunday ... 6 = Saturday
alter table public.employees add column if not exists off_days smallint[] not null default '{}';
comment on column public.employees.off_days is 'Weekly off day(s) of the staff member: 0 = Sunday, 1 = Monday ... 6 = Saturday.';

update public.employees e set off_days = v.days
from (values
  ('WAN SALLEH HOODIN BIN WAN MAHMOOD', '{5}'::smallint[]),
  ('KYAW HTOO (DOLLAH)', '{1}'::smallint[]),
  ('ZAY YAR KYAW (JOE)', '{2}'::smallint[]),
  ('HTIKE THU', '{3}'::smallint[]),
  ('SAIFUL FADELI BIN AHMAD', '{0}'::smallint[])
) as v(full_name, days)
where upper(btrim(e.full_name)) = v.full_name;
