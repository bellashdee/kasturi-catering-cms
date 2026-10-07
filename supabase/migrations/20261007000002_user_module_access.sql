-- Per-user module restriction: allowed_modules NULL = every module; otherwise only the listed module keys.
alter table user_company_access add column allowed_modules text[];

create or replace function public.user_has_module(target_company_id uuid, module_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_company_access uca
    where uca.user_id = auth.uid()
      and (uca.company_id = target_company_id or uca.company_id is null)
      and (uca.allowed_modules is null or module_key = any (uca.allowed_modules))
  );
$$;

revoke execute on function public.user_has_module(uuid, text) from public;
grant execute on function public.user_has_module(uuid, text) to authenticated;

-- Restrictive policies are ANDed with the existing ones, so they only ever narrow access.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('employee_certificates', 'hr'), ('employee_private_details', 'hr'), ('leave_requests', 'hr'), ('overtime_records', 'hr'),
      ('payroll_records', 'hr'), ('company_documents', 'hr'), ('attendance_records', 'hr'),
      ('campaigns', 'marketing'), ('campaign_performance', 'marketing'), ('content_items', 'marketing'), ('leads', 'marketing'),
      ('marketing_expenses', 'marketing'), ('promotions', 'marketing'),
      ('procurement_requests', 'supplier-procurement'), ('purchase_orders', 'supplier-procurement'),
      ('supplier_invoices', 'supplier-procurement'), ('supplier_payments', 'supplier-procurement'),
      ('budgets', 'finance-admin'), ('customer_invoices', 'finance-admin'), ('customer_payments', 'finance-admin'),
      ('expenses', 'finance-admin'), ('finance_payments', 'finance-admin'), ('payment_accounts', 'finance-admin'),
      ('monthly_sales', 'finance-admin'), ('petty_cash_transactions', 'finance-admin')
    ) as t(tbl, module_key)
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all using (public.user_has_module(company_id, %L)) with check (public.user_has_module(company_id, %L))',
      r.tbl || '_module_gate', r.tbl, r.module_key, r.module_key
    );
  end loop;
end $$;
