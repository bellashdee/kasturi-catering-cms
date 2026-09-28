-- expenses already has a select policy; add write access
create policy "expenses_insert" on expenses for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "expenses_update" on expenses for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- customer_payments already has a select policy; add insert (no status field to update)
create policy "customer_payments_insert" on customer_payments for insert to authenticated
  with check (public.user_has_company_access(company_id));

alter table cost_categories enable row level security;
create policy "cost_categories_select" on cost_categories for select to authenticated
  using (company_id is null or public.user_has_company_access(company_id));
create policy "cost_categories_insert" on cost_categories for insert to authenticated
  with check (company_id is not null and public.user_has_company_access(company_id));
create policy "cost_categories_update" on cost_categories for update to authenticated
  using (company_id is not null and public.user_has_company_access(company_id))
  with check (company_id is not null and public.user_has_company_access(company_id));

alter table petty_cash_transactions enable row level security;
create policy "petty_cash_transactions_all" on petty_cash_transactions for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table budgets enable row level security;
create policy "budgets_all" on budgets for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
