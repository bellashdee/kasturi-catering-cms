-- Records that could be created and changed but never deleted get a delete rule: the admins of the company may delete them (the app checks first
-- that nothing else depends on the record and offers Undo straight after). The restrictive module gates stay in force.
do $$
declare t text;
begin
  foreach t in array array['suppliers', 'supplier_invoices', 'customer_invoices', 'customers', 'catering_events', 'ingredients'] loop
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.user_is_company_admin(company_id))', t || '_delete', t);
  end loop;
end $$;
