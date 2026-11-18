-- Supplier invoices: no status / approval step any more (an invoice is valid as soon as it is keyed in), no Related Purchase
-- Order on the form, and a new "AutoCount Invoice No.": the customer (sales) invoice number in AutoCount of the event this
-- cost belongs to (e.g. INV-KI2611/004). Through that number the supplier invoice counts straight away as a direct cost in the
-- Event P&L of the event the customer invoice is linked to, also when the AutoCount invoice is uploaded later.
-- A supplier invoice that is already recorded as an event cost entry (the earlier manual way) is not counted a second time.

alter table public.supplier_invoices add column if not exists autocount_invoice_no text;

comment on column public.supplier_invoices.autocount_invoice_no is
  'The AutoCount customer invoice number of the event this cost belongs to (stored upper-case, no spaces). Matched to customer_invoices.invoice_number -> catering_event_id for the Event P&L.';

create index if not exists supplier_invoices_autocount_invoice_no_idx on public.supplier_invoices (autocount_invoice_no) where autocount_invoice_no is not null;

-- Lookup for the supplier invoice form: the customer invoice with this number (any spacing / case) in the companies the
-- person belongs to, with its event and customer. Security definer so a purchaser without the Admin & Finance module still
-- sees which event the number belongs to (only these few fields, only for their own companies).
create or replace function public.find_autocount_customer_invoice(p_number text)
returns table (
  customer_invoice_id uuid,
  invoice_number text,
  company_name text,
  customer_name text,
  catering_event_id uuid,
  event_name text,
  event_reference text,
  event_date date
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select ci.id, ci.invoice_number, co.name, cu.name, ci.catering_event_id, ev.event_name, ev.event_reference, ev.event_date
  from customer_invoices ci
  join companies co on co.id = ci.company_id
  left join customers cu on cu.id = ci.customer_id
  left join catering_events ev on ev.id = ci.catering_event_id
  where upper(regexp_replace(ci.invoice_number, '\s', '', 'g')) = upper(regexp_replace(coalesce(p_number, ''), '\s', '', 'g'))
    and coalesce(p_number, '') <> ''
    and ci.company_id in (select public.user_company_ids())
  order by ci.created_at desc
  limit 5;
$$;

revoke all on function public.find_autocount_customer_invoice(text) from public, anon;
grant execute on function public.find_autocount_customer_invoice(text) to authenticated;

-- For the Event P&L: the supplier invoices whose AutoCount Invoice No. is a customer invoice of one of these events and that
-- are not already an event cost entry, with their lines. Same access rule as event_cost_entries (Admin & Finance module of the
-- event's company, and admin of it or one of the Quotation Request Inbox people).
create or replace function public.event_autocount_supplier_invoices(p_event_ids uuid[])
returns table (
  catering_event_id uuid,
  supplier_invoice_id uuid,
  invoice_number text,
  invoice_date date,
  amount numeric,
  autocount_invoice_no text,
  supplier_name text,
  company_name text,
  items jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct on (si.id)
    ci.catering_event_id, si.id, si.invoice_number, si.invoice_date, si.amount, si.autocount_invoice_no, s.name, co.name,
    coalesce((select jsonb_agg(jsonb_build_object('item_name', it.item_name, 'line_total', it.line_total)) from supplier_invoice_items it where it.supplier_invoice_id = si.id), '[]'::jsonb)
  from customer_invoices ci
  join catering_events ev on ev.id = ci.catering_event_id
  join supplier_invoices si on si.autocount_invoice_no = upper(regexp_replace(ci.invoice_number, '\s', '', 'g'))
  left join suppliers s on s.id = si.supplier_id
  join companies co on co.id = si.company_id
  where ci.catering_event_id = any(p_event_ids)
    and ev.company_id in (select public.user_module_company_ids('finance-admin'))
    and public.user_can_manage_event_pnl(ev.company_id)
    and not exists (select 1 from event_cost_entries ece where ece.supplier_invoice_id = si.id)
  order by si.id, ci.created_at;
$$;

revoke all on function public.event_autocount_supplier_invoices(uuid[]) from public, anon;
grant execute on function public.event_autocount_supplier_invoices(uuid[]) to authenticated;
