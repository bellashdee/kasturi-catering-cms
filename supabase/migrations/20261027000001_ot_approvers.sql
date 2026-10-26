-- Only four people may approve or reject the OT form of the staff: Saiful, Redza, Atiq and Ismaizal. The other managers and admins can still see the OT
-- records (as before) but cannot decide them. Nobody can decide their own OT (kept).
create table if not exists public.ot_approvers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.ot_approvers enable row level security;
drop policy if exists ot_approvers_own on public.ot_approvers;
create policy ot_approvers_own on public.ot_approvers for select to authenticated using (user_id = auth.uid());

insert into public.ot_approvers (user_id, note)
select v.id::uuid, v.note
from (values
  ('9f51fcc9-7c1b-4ca4-8f09-dc290d6f8a2d', 'Mr. Saiful'),
  ('264c2671-9e46-4ecc-8fab-494bc9703a13', 'Mr. Redza'),
  ('d08bc8b7-ddd8-4cad-8d90-8c33fe6dbb44', 'Mr. Atiq'),
  ('88d03d77-a795-4a9e-bae7-b64290c384cd', 'Mr. Ismaizal')
) as v(id, note)
where exists (select 1 from auth.users u where u.id = v.id::uuid)
on conflict (user_id) do nothing;

create or replace function public.user_can_approve_ot(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ot_approvers where user_id = auth.uid());
$$;
revoke execute on function public.user_can_approve_ot(uuid) from public, anon;
grant execute on function public.user_can_approve_ot(uuid) to authenticated;

create or replace function public.overtime_before_write()
returns trigger language plpgsql as $$
declare span interval;
begin
  if new.ot_start_time is not null and new.ot_end_time is not null then
    span := new.ot_end_time - new.ot_start_time;
    if span <= interval '0' then span := span + interval '24 hours'; end if;
    new.hours := round(extract(epoch from span) / 3600.0, 2);
  end if;
  new.updated_at := now();

  if auth.uid() is not null and tg_op = 'UPDATE'
     and new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    if not public.user_can_approve_ot(new.company_id) then
      raise exception 'Only Saiful, Redza, Atiq or Ismaizal can approve or reject overtime.';
    end if;
    if public.user_owns_employee(new.employee_id) then
      raise exception 'You cannot approve or reject your own overtime.';
    end if;
  end if;
  return new;
end;
$$;

-- Branch of the staff: Kilang 1, Kilang 2, Restoran Bara or UTM (from the list given by the Director of Finance), matched by the name on the staff record.
update public.employees set branch = 'KILANG 1' where btrim(full_name) in (
  'CHAN KUOK HAO', 'CHAN PIT NYET', 'MD NUR AZMI BIN MD SALLEH', 'ISMAIZAL BIN MOHD ISMAIL', 'NUR RASYIDAH NABILAH BINTI MOHD RASHIDI',
  'MOHD FAIDZ BIN RASHID', 'MUHAMMAD SYAMIE BIN SAIPULLAZIM', 'MUHAMAD FADIL BIN AHMAD', 'KHAIRUL ADLAN BIN SAGIMAN',
  'SYAZA SYAHIRAH BINTI MOHAMAD SAIRI', 'NUR AZREEN FAZRIENA BINTI MOHD FAIDZ', 'NIK HANNAH AWANIS BINTI SUPIAN', 'FADILAH BINTI RASHID',
  'MOHD RAZIN BIN SAMSUDIN', 'MOHD ZAHIRUDDIN BIN GHAZALLI', 'MUHAMMAD ATIQUFARHAN BIN AB HAMID', 'MUSA BIN ABDULLAH', 'SHARUDIN BIN YUNUS',
  'MOHD REDZA BIN MOHAMED JASMIN', 'MUHAMMAD ZARIF BIN MOHD ASRI', 'SWAN KHANT PAING (KO T)', 'MYO SWEE OO (HUSIN)', 'PYAE THIHA NAING',
  'THIHA NAING (THIHA)', 'TUN TUN WIN (RAMLI)', 'HOSSAIN MD BILLAL'
);
-- Zaky works at Kilang 1 (Signature Solution) and at Restoran Bara (O2 Life)
update public.employees set branch = 'KILANG 1' where btrim(full_name) = 'ZAKY BIN YAHYA' and company_id = (select id from public.companies where name = 'Signature Solution');
update public.employees set branch = 'RESTORAN BARA' where btrim(full_name) = 'ZAKY BIN YAHYA' and company_id = (select id from public.companies where name = 'O2 Life');
update public.employees set branch = 'KILANG 2' where btrim(full_name) in (
  'SAIFUL FADELI BIN AHMAD', 'WAN SALLEH HOODIN BIN WAN MAHMOOD', 'KYAW HTOO (DOLLAH)', 'ZAY YAR KYAW (JOE)', 'HTIKE THU'
);
update public.employees set branch = 'RESTORAN BARA' where btrim(full_name) in (
  'MUHAMMAD HAFIZI BIN MAMAT', 'MUHAMMAD FAKHRUL AKMAL BIN SALIM', 'MOHAMMAD MUGHNI BIN MOHD ADNAN', 'WIN THUT', 'SOE MOE KYAW', 'SAN SHWE MAUNG',
  'AUNG THU KHAING', 'WAI YAN MOE', 'R .NURLELA', 'AYE KYAW SOE', 'ARKAR', 'DENTI KARIMA'
);
