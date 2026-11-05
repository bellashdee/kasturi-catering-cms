-- Mr. Adlan gets full access (add, edit, save, cancel, delete) in Supplier & Procurement, Kitchen, Operation (Driver & Logistics) and Admin & Finance,
-- WITHOUT being made a Company Admin: HR private details, payroll, settings and the Priority Centre stay with the admins.
-- A person on the module_editors list passes the "admin" check of the tables of THAT module only.
create table if not exists public.module_editors (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, module_key)
);
alter table public.module_editors enable row level security;
drop policy if exists module_editors_own on public.module_editors;
create policy module_editors_own on public.module_editors for select to authenticated using (user_id = auth.uid());

insert into public.module_editors (user_id, module_key, note)
select '0cebe546-3d50-44e8-ab51-e23d2082e23d', m, 'Mr. Adlan'
from unnest(array['supplier-procurement', 'kitchen', 'driver-logistics', 'finance-admin']) as m
where exists (select 1 from auth.users where id = '0cebe546-3d50-44e8-ab51-e23d2082e23d')
on conflict (user_id, module_key) do nothing;

create or replace function public.user_is_module_editor(target_company_id uuid, target_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.user_is_company_admin(target_company_id)
    or (exists (select 1 from public.module_editors where user_id = auth.uid() and module_key = target_module)
        and public.user_has_company_access(target_company_id)
        and public.user_has_module(target_company_id, target_module));
$$;
revoke execute on function public.user_is_module_editor(uuid, text) from public, anon;
grant execute on function public.user_is_module_editor(uuid, text) to authenticated;

-- payments (all categories) follow the Admin & Finance module; supplier payments keep the earlier editors list too
create or replace function public.user_can_manage_payments(target_company_id uuid, target_category text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.user_is_module_editor(target_company_id, 'finance-admin')
    or (target_category = 'supplier' and exists (select 1 from public.supplier_payment_editors where user_id = auth.uid())
        and exists (select 1 from public.user_company_access uca where uca.user_id = auth.uid() and (uca.company_id = target_company_id or uca.company_id is null)));
$$;

drop policy if exists breakdown_items_delete on public.breakdown_items;
create policy breakdown_items_delete on public.breakdown_items for delete using (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists breakdown_items_insert on public.breakdown_items;
create policy breakdown_items_insert on public.breakdown_items for insert with check (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists breakdown_items_update on public.breakdown_items;
create policy breakdown_items_update on public.breakdown_items for update using (public.user_is_module_editor(company_id, 'finance-admin')) with check (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists customer_invoices_delete on public.customer_invoices;
create policy customer_invoices_delete on public.customer_invoices for delete using (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists customer_payments_delete on public.customer_payments;
create policy customer_payments_delete on public.customer_payments for delete using (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists customer_payments_update on public.customer_payments;
create policy customer_payments_update on public.customer_payments for update using (public.user_is_module_editor(company_id, 'finance-admin')) with check (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists monthly_purchases_delete on public.monthly_purchases;
create policy monthly_purchases_delete on public.monthly_purchases for delete using (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists monthly_purchases_insert on public.monthly_purchases;
create policy monthly_purchases_insert on public.monthly_purchases for insert with check (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists monthly_purchases_update on public.monthly_purchases;
create policy monthly_purchases_update on public.monthly_purchases for update using (public.user_is_module_editor(company_id, 'finance-admin')) with check (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists supplier_payment_controls_insert on public.supplier_payment_controls;
create policy supplier_payment_controls_insert on public.supplier_payment_controls for insert with check (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists supplier_payment_controls_select on public.supplier_payment_controls;
create policy supplier_payment_controls_select on public.supplier_payment_controls for select using (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists supplier_payment_controls_update on public.supplier_payment_controls;
create policy supplier_payment_controls_update on public.supplier_payment_controls for update using (public.user_is_module_editor(company_id, 'finance-admin')) with check (public.user_is_module_editor(company_id, 'finance-admin'));
drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers for delete using (public.user_is_module_editor(company_id, 'supplier-procurement'));
drop policy if exists supplier_invoices_delete on public.supplier_invoices;
create policy supplier_invoices_delete on public.supplier_invoices for delete using (public.user_is_module_editor(company_id, 'supplier-procurement'));
drop policy if exists ingredients_delete on public.ingredients;
create policy ingredients_delete on public.ingredients for delete using (public.user_is_module_editor(company_id, 'kitchen'));
