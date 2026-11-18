-- One rule across the app (Ms. Nabilah, 18 Nov 2026): every event's reference is its AutoCount (customer) invoice number, and
-- any cost keyed in with that number counts straight away in that event's P&L. Supplier invoices already have it
-- (20261118000010); this adds the same "AutoCount Invoice No." to company expenses, the petty cash holder's book and staff
-- claims. It is NOT their existing invoice_no (the supplier's printed receipt number). Stored upper-case without spaces; when it
-- is left blank but the remarks contain an AutoCount number (INV-KI2611/004, I-SSC2610/015), the app fills it from there on save.

alter table public.expenses add column if not exists autocount_invoice_no text;
alter table public.operation_petty_cash add column if not exists autocount_invoice_no text;
alter table public.petty_cash_transactions add column if not exists autocount_invoice_no text;

create index if not exists expenses_autocount_invoice_no_idx on public.expenses (autocount_invoice_no) where autocount_invoice_no is not null;
create index if not exists operation_petty_cash_autocount_invoice_no_idx on public.operation_petty_cash (autocount_invoice_no) where autocount_invoice_no is not null;
create index if not exists petty_cash_transactions_autocount_invoice_no_idx on public.petty_cash_transactions (autocount_invoice_no) where autocount_invoice_no is not null;

-- Every cost keyed in with the AutoCount invoice number of one of these events: supplier invoices (not already an event cost
-- entry), company expenses (a credit note counts as minus), petty cash spent (not top-ups) and staff claims (not top-ups).
-- Same access rule as event_cost_entries. category_text / items are used to propose the P&L category.
create or replace function public.event_autocount_costs(p_event_ids uuid[])
returns table (
  catering_event_id uuid,
  source text,
  source_id uuid,
  reference text,
  cost_date date,
  amount numeric,
  autocount_invoice_no text,
  party_name text,
  company_name text,
  category_text text,
  items jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ev_numbers as (
    select distinct ci.catering_event_id, upper(regexp_replace(ci.invoice_number, '\s', '', 'g')) as no
    from customer_invoices ci
    join catering_events ev on ev.id = ci.catering_event_id
    where ci.catering_event_id = any(p_event_ids)
      and ev.company_id in (select public.user_module_company_ids('finance-admin'))
      and public.user_can_manage_event_pnl(ev.company_id)
  )
  select n.catering_event_id, 'supplier_invoice', si.id, si.invoice_number, si.invoice_date, si.amount, si.autocount_invoice_no,
         s.name, co.name, null::text,
         coalesce((select jsonb_agg(jsonb_build_object('item_name', it.item_name, 'line_total', it.line_total)) from supplier_invoice_items it where it.supplier_invoice_id = si.id), '[]'::jsonb)
  from ev_numbers n
  join supplier_invoices si on si.autocount_invoice_no = n.no
  left join suppliers s on s.id = si.supplier_id
  join companies co on co.id = si.company_id
  where not exists (select 1 from event_cost_entries ece where ece.supplier_invoice_id = si.id)
  union all
  select n.catering_event_id, 'expense', e.id, e.invoice_no, e.expense_date,
         case when e.note_type = 'credit_note' then -abs(e.amount) else e.amount end, e.autocount_invoice_no,
         null, co.name, concat_ws(' ', e.category, e.notes), '[]'::jsonb
  from ev_numbers n
  join expenses e on e.autocount_invoice_no = n.no
  join companies co on co.id = e.company_id
  union all
  select n.catering_event_id, 'petty_cash', p.id, p.invoice_no, p.entry_date, p.amount, p.autocount_invoice_no,
         p.person_name, co.name, concat_ws(' ', p.category, p.description), '[]'::jsonb
  from ev_numbers n
  join operation_petty_cash p on p.autocount_invoice_no = n.no and p.entry_type <> 'top_up'
  join companies co on co.id = p.company_id
  union all
  select n.catering_event_id, 'staff_claim', t.id, t.invoice_no, t.transaction_date, t.amount, t.autocount_invoice_no,
         coalesce(t.claimant_name, t.person_name), co.name, concat_ws(' ', t.category, t.description), '[]'::jsonb
  from ev_numbers n
  join petty_cash_transactions t on t.autocount_invoice_no = n.no and t.type <> 'top_up'
  join companies co on co.id = t.company_id;
$$;

revoke all on function public.event_autocount_costs(uuid[]) from public, anon;
grant execute on function public.event_autocount_costs(uuid[]) to authenticated;
