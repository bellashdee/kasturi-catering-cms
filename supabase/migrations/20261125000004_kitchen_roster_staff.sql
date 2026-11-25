-- the kitchen staff who can be put on the duty roster (the "Add staff" choices), with the short name shown on the roster
create table if not exists public.kitchen_roster_staff (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  full_name text not null,
  short_name text not null,
  sort_order int not null default 0
);
alter table public.kitchen_roster_staff enable row level security;
drop policy if exists kitchen_roster_staff_select on public.kitchen_roster_staff;
create policy kitchen_roster_staff_select on public.kitchen_roster_staff for select to authenticated using (true);
drop policy if exists kitchen_roster_staff_write on public.kitchen_roster_staff;
create policy kitchen_roster_staff_write on public.kitchen_roster_staff for all to authenticated
  using (public.user_can_edit_kitchen_roster()) with check (public.user_can_edit_kitchen_roster());

insert into public.kitchen_roster_staff (employee_id, full_name, short_name, sort_order) values
  ('2b0eea3b-7005-4629-9eb0-e2d8696bcae2', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID', 'ATIQ', 0),
  ('2800ab82-9eb4-455e-a3c8-287fcf851937', 'MUSA BIN ABDULLAH', 'MUSA', 1),
  ('299157da-0511-4aba-9b0d-7e73482615d6', 'MOHD RAZIN BIN SAMSUDIN', 'RAZIN', 2),
  ('e6888968-ce6a-47fd-ab4e-0daf9bddf1fb', 'SWAM KHANT PAING (KO T)', 'KO T', 3),
  ('0d5a41ba-2354-4db6-840f-99b8274a835b', 'MYO SWEE OO (HUSIN)', 'HUSIN', 4),
  ('552028e8-911b-4a09-8429-257df9b4b41b', 'PYAE THIHA NAING', 'NAING', 5),
  ('78d1321f-cc62-4077-8e52-ecaef5e8a950', 'BILLAL MD HOSSAIN', 'BILLAL', 6)
on conflict (employee_id) do update set full_name = excluded.full_name, short_name = excluded.short_name, sort_order = excluded.sort_order;
