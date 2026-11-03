-- Mr. Adlan (and anyone added here later) may key in, edit, cancel and delete SUPPLIER payments, without being made a Company Admin.
-- Rental and utilities payments, and everything else a Company Admin can do, stay with the admins.
create table if not exists public.supplier_payment_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.supplier_payment_editors enable row level security;
drop policy if exists supplier_payment_editors_own on public.supplier_payment_editors;
create policy supplier_payment_editors_own on public.supplier_payment_editors for select to authenticated using (user_id = auth.uid());

insert into public.supplier_payment_editors (user_id, note)
select '0cebe546-3d50-44e8-ab51-e23d2082e23d', 'Mr. Adlan'
where exists (select 1 from auth.users where id = '0cebe546-3d50-44e8-ab51-e23d2082e23d')
on conflict (user_id) do nothing;

create or replace function public.user_can_manage_payments(target_company_id uuid, target_category text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.user_is_company_admin(target_company_id)
    or (target_category = 'supplier' and exists (select 1 from public.supplier_payment_editors where user_id = auth.uid())
        and exists (select 1 from public.user_company_access uca where uca.user_id = auth.uid() and (uca.company_id = target_company_id or uca.company_id is null)));
$$;
revoke execute on function public.user_can_manage_payments(uuid, text) from public, anon;
grant execute on function public.user_can_manage_payments(uuid, text) to authenticated;

drop policy if exists finance_payments_select on finance_payments;
drop policy if exists finance_payments_insert on finance_payments;
drop policy if exists finance_payments_update on finance_payments;
create policy finance_payments_select on finance_payments for select using (public.user_can_manage_payments(company_id, category));
create policy finance_payments_insert on finance_payments for insert with check (public.user_can_manage_payments(company_id, category));
create policy finance_payments_update on finance_payments for update using (public.user_can_manage_payments(company_id, category)) with check (public.user_can_manage_payments(company_id, category));

drop policy if exists payment_accounts_select on payment_accounts;
drop policy if exists payment_accounts_insert on payment_accounts;
drop policy if exists payment_accounts_update on payment_accounts;
create policy payment_accounts_select on payment_accounts for select using (public.user_can_manage_payments(company_id, category));
create policy payment_accounts_insert on payment_accounts for insert with check (public.user_can_manage_payments(company_id, category));
create policy payment_accounts_update on payment_accounts for update using (public.user_can_manage_payments(company_id, category)) with check (public.user_can_manage_payments(company_id, category));
