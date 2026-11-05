-- Event Profit & Loss: besides the Finance / Admin users of a company, the Quotation Request Inbox people (Ms. Nabilah, Mr. Adlan,
-- Ms. Penny) can read and keep the revenue, costs and budget of the events of the companies they work in. The existing rules stay as
-- they are (these are extra permissive policies; the Finance module gate still applies to everyone).

create function public.user_can_manage_event_pnl(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.user_is_company_admin(target_company_id)
    or (public.user_has_quotation_request_access() and public.user_has_company_access(target_company_id));
$$;
revoke execute on function public.user_can_manage_event_pnl(uuid) from public, anon;
grant execute on function public.user_can_manage_event_pnl(uuid) to authenticated;

create policy event_revenue_entries_inbox_select on event_revenue_entries for select to authenticated using (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
create policy event_revenue_entries_inbox_insert on event_revenue_entries for insert to authenticated with check (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
create policy event_revenue_entries_inbox_update on event_revenue_entries for update to authenticated using (public.user_has_quotation_request_access() and public.user_has_company_access(company_id)) with check (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
create policy event_revenue_entries_inbox_delete on event_revenue_entries for delete to authenticated using (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));

create policy event_cost_entries_inbox_select on event_cost_entries for select to authenticated using (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
create policy event_cost_entries_inbox_insert on event_cost_entries for insert to authenticated with check (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
create policy event_cost_entries_inbox_update on event_cost_entries for update to authenticated using (public.user_has_quotation_request_access() and public.user_has_company_access(company_id)) with check (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
create policy event_cost_entries_inbox_delete on event_cost_entries for delete to authenticated using (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));

create policy event_budgets_inbox_select on event_budgets for select to authenticated using (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
create policy event_budgets_inbox_insert on event_budgets for insert to authenticated with check (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
create policy event_budgets_inbox_update on event_budgets for update to authenticated using (public.user_has_quotation_request_access() and public.user_has_company_access(company_id)) with check (public.user_has_quotation_request_access() and public.user_has_company_access(company_id));
