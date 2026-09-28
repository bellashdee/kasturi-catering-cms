-- suppliers, supplier_invoices, supplier_payments already have select policies; add write access
create policy "suppliers_insert" on suppliers for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "suppliers_update" on suppliers for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

create policy "supplier_invoices_insert" on supplier_invoices for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "supplier_invoices_update" on supplier_invoices for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

create policy "supplier_payments_insert" on supplier_payments for insert to authenticated
  with check (public.user_has_company_access(company_id));
create policy "supplier_payments_update" on supplier_payments for update to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- approvals already has insert/update policies from the HR migration — no change needed

alter table purchase_orders enable row level security;
create policy "purchase_orders_all" on purchase_orders for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table purchase_order_items enable row level security;
create policy "purchase_order_items_all" on purchase_order_items for all to authenticated
  using (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id and public.user_has_company_access(po.company_id)))
  with check (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id and public.user_has_company_access(po.company_id)));

alter table procurement_requests enable row level security;
create policy "procurement_requests_all" on procurement_requests for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

alter table supplier_invoice_items enable row level security;
create policy "supplier_invoice_items_all" on supplier_invoice_items for all to authenticated
  using (exists (select 1 from supplier_invoices si where si.id = supplier_invoice_items.supplier_invoice_id and public.user_has_company_access(si.company_id)))
  with check (exists (select 1 from supplier_invoices si where si.id = supplier_invoice_items.supplier_invoice_id and public.user_has_company_access(si.company_id)));
