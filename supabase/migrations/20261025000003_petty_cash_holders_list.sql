-- The people who hold a petty cash: Penny, Redza, Saiful, Ismaizal, Nabilah, Adlan (and Adi, once he has a staff record and a login).
-- Penny, Nabilah and Reza already had access. The others are added; nobody but Penny and Nabilah can see everyone's petty cash.
insert into public.operation_petty_cash_access (user_id, note, can_see_all)
select v.user_id::uuid, v.note, false
from (values
  ('88d03d77-a795-4a9e-bae7-b64290c384cd', 'Mr. Ismaizal - holds a petty cash'),
  ('0cebe546-3d50-44e8-ab51-e23d2082e23d', 'Mr. Adlan - holds a petty cash'),
  ('9f51fcc9-7c1b-4ca4-8f09-dc290d6f8a2d', 'Mr. Saiful - holds a petty cash')
) as v(user_id, note)
where exists (select 1 from auth.users u where u.id = v.user_id::uuid)
on conflict (user_id) do nothing;

-- A petty cash is kept under the name of the staff record, so the staff record must be linked to the login of the same person.
update public.employees set user_id = '264c2671-9e46-4ecc-8fab-494bc9703a13'
where full_name = 'MOHD REDZA BIN MOHAMED JASMIN' and user_id is null;
update public.employees set user_id = '9f51fcc9-7c1b-4ca4-8f09-dc290d6f8a2d'
where full_name = 'SAIFUL FADELI BIN AHMAD' and user_id is null;
