-- A customer payment that was recorded wrongly can be corrected or deleted by the admins of the company (the invoice status is worked out again by the app).
drop policy if exists customer_payments_update on public.customer_payments;
create policy customer_payments_update on public.customer_payments for update to authenticated
  using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));
drop policy if exists customer_payments_delete on public.customer_payments;
create policy customer_payments_delete on public.customer_payments for delete to authenticated
  using (public.user_is_company_admin(company_id));
