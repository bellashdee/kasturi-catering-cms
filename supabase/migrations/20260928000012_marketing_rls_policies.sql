-- campaigns and customers already have select policies from migration 004; add write access
create policy "campaigns_insert" on campaigns for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "campaigns_update" on campaigns for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

create policy "customers_insert" on customers for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "customers_update" on customers for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table content_items enable row level security;
create policy "content_items_all" on content_items for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table leads enable row level security;
create policy "leads_all" on leads for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table promotions enable row level security;
create policy "promotions_all" on promotions for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table marketing_expenses enable row level security;
create policy "marketing_expenses_all" on marketing_expenses for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table campaign_performance enable row level security;
create policy "campaign_performance_all" on campaign_performance for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
