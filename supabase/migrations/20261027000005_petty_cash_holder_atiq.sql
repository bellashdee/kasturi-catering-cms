-- Chef Atiq (Executive Head Chef) holds a petty cash: he can record, edit (Save / Cancel) and delete his own petty cash, like the other holders.
-- Like the others he sees only his own; nobody but Ms. Penny and Ms. Nabilah can see everyone's.
insert into public.operation_petty_cash_access (user_id, note, can_see_all)
select 'd08bc8b7-ddd8-4cad-8d90-8c33fe6dbb44'::uuid, 'Chef Atiq - Head Chef, holds a petty cash', false
where exists (select 1 from auth.users u where u.id = 'd08bc8b7-ddd8-4cad-8d90-8c33fe6dbb44'::uuid)
on conflict (user_id) do nothing;

-- the petty cash is kept under the name of the staff record, so the staff record is linked to his login
update public.employees set user_id = 'd08bc8b7-ddd8-4cad-8d90-8c33fe6dbb44'
where full_name = 'MUHAMMAD ATIQUFARHAN BIN AB HAMID' and user_id is null
  and exists (select 1 from auth.users u where u.id = 'd08bc8b7-ddd8-4cad-8d90-8c33fe6dbb44'::uuid);

insert into public.operation_petty_cash_holders (full_name) values ('MUHAMMAD ATIQUFARHAN BIN AB HAMID')
on conflict (full_name) do nothing;
