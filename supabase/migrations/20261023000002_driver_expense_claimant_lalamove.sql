-- Operation expenses: the person who claims the expense is chosen from the staff list, and the "Mileage" category is replaced by "Lalamove".
alter table public.driver_expenses
  add column claimed_by uuid references public.employees (id) on delete set null;

create index driver_expenses_claimed_by_idx on public.driver_expenses (claimed_by);

alter table public.driver_expenses drop constraint driver_expenses_category_check;
update public.driver_expenses set category = 'lalamove' where category = 'mileage';
alter table public.driver_expenses
  add constraint driver_expenses_category_check check (category = any (array['fuel'::text, 'lalamove'::text, 'parking'::text, 'toll'::text, 'other'::text]));
