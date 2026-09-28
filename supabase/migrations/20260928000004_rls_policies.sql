create or replace function public.user_has_company_access(target_company_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and (uca.company_id = target_company_id or uca.company_id is null)
  );
$$;

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and uca.role = 'super_admin'
      and uca.company_id is null
  );
$$;

alter table companies enable row level security;
create policy "companies_select" on companies for select to authenticated using (public.user_has_company_access(id));

alter table profiles enable row level security;
create policy "profiles_select_all" on profiles for select to authenticated using (true);
create policy "profiles_update_own" on profiles for update to authenticated using (auth.uid() = id);

alter table user_company_access enable row level security;
create policy "uca_select_own_or_admin" on user_company_access for select to authenticated using (user_id = auth.uid() or public.current_user_is_super_admin());

alter table suppliers enable row level security;
create policy "suppliers_select" on suppliers for select to authenticated using (public.user_has_company_access(company_id));

alter table supplier_invoices enable row level security;
create policy "supplier_invoices_select" on supplier_invoices for select to authenticated using (public.user_has_company_access(company_id));

alter table supplier_payments enable row level security;
create policy "supplier_payments_select" on supplier_payments for select to authenticated using (public.user_has_company_access(company_id));

alter table customers enable row level security;
create policy "customers_select" on customers for select to authenticated using (public.user_has_company_access(company_id));

alter table customer_invoices enable row level security;
create policy "customer_invoices_select" on customer_invoices for select to authenticated using (public.user_has_company_access(company_id));

alter table customer_payments enable row level security;
create policy "customer_payments_select" on customer_payments for select to authenticated using (public.user_has_company_access(company_id));

alter table catering_events enable row level security;
create policy "catering_events_select" on catering_events for select to authenticated using (public.user_has_company_access(company_id));

alter table production_orders enable row level security;
create policy "production_orders_select" on production_orders for select to authenticated using (public.user_has_company_access(company_id));

alter table deliveries enable row level security;
create policy "deliveries_select" on deliveries for select to authenticated using (public.user_has_company_access(company_id));

alter table employees enable row level security;
create policy "employees_select" on employees for select to authenticated using (public.user_has_company_access(company_id));

alter table employee_certificates enable row level security;
create policy "employee_certificates_select" on employee_certificates for select to authenticated using (public.user_has_company_access(company_id));

alter table campaigns enable row level security;
create policy "campaigns_select" on campaigns for select to authenticated using (public.user_has_company_access(company_id));

alter table approvals enable row level security;
create policy "approvals_select" on approvals for select to authenticated using (
  (company_id is not null and public.user_has_company_access(company_id))
  or public.current_user_is_super_admin()
);

alter table ingredients enable row level security;
create policy "ingredients_select" on ingredients for select to authenticated using (public.user_has_company_access(company_id));

alter table vehicles enable row level security;
create policy "vehicles_select" on vehicles for select to authenticated using (public.user_has_company_access(company_id));

alter table expenses enable row level security;
create policy "expenses_select" on expenses for select to authenticated using (public.user_has_company_access(company_id));
