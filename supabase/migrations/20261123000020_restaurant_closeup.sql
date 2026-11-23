-- Restaurant system: the FeedMe "Close up" report of ONE day (payment summary, type summary, sales summary). O2 Life only. Additive.
-- The Close up gives the day split by payment method AND, separately, by order type (the cross of the two is not in the file and is never invented).
-- It explains a day total, it is not a second sale: it is attached to the day total of the same date (made from the Overview file or created by the
-- Close up itself with origin 'closeup'). Nothing is overwritten; a Close up is imported once per day (unique); it is insert-only.

alter table public.rst_sales_day_totals add column if not exists origin text not null default 'overview' check (origin in ('overview', 'closeup'));

create table if not exists public.rst_day_closeups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  day_total_id uuid not null unique references public.rst_sales_day_totals(id) on delete cascade,
  sales_date date not null,
  bills integer not null check (bills >= 0),
  pax integer check (pax is null or pax >= 0),
  nett numeric(12,2) not null,
  void_bills integer not null default 0 check (void_bills >= 0),
  void_amount numeric(12,2) not null default 0 check (void_amount >= 0),
  refund_amount numeric(12,2) not null default 0 check (refund_amount >= 0),
  source_file text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists rst_day_closeups_company_date_idx on public.rst_day_closeups (company_id, sales_date);

create table if not exists public.rst_day_closeup_splits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  closeup_id uuid not null references public.rst_day_closeups(id) on delete cascade,
  day_total_id uuid not null references public.rst_sales_day_totals(id) on delete cascade,
  sales_date date not null,
  kind text not null check (kind in ('payment', 'channel')),
  raw_label text not null check (btrim(raw_label) <> ''),
  mapped_key text not null,
  qty integer not null default 0 check (qty >= 0),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (closeup_id, kind, raw_label),
  check (
    (kind = 'payment' and mapped_key in ('cash', 'qr_duitnow', 'card', 'online_platform', 'other'))
    or (kind = 'channel' and mapped_key in ('dine_in', 'takeaway', 'delivery', 'online', 'other'))
  )
);
create index if not exists rst_day_closeup_splits_company_date_idx on public.rst_day_closeup_splits (company_id, sales_date);

create trigger rst_day_closeups_audit_trg after insert or update or delete on public.rst_day_closeups
  for each row execute function public.rst_audit();
create trigger rst_day_closeup_splits_audit_trg after insert or update or delete on public.rst_day_closeup_splits
  for each row execute function public.rst_audit();

alter table public.rst_day_closeups enable row level security;
alter table public.rst_day_closeup_splits enable row level security;

create policy rst_day_closeups_select on public.rst_day_closeups for select to authenticated
  using (company_id in (select public.user_company_ids()));
create policy rst_day_closeups_insert on public.rst_day_closeups for insert to authenticated
  with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_day_closeups_module_gate on public.rst_day_closeups as restrictive for all to authenticated
  using (company_id in (select public.user_module_company_ids('restaurant')))
  with check (company_id in (select public.user_module_company_ids('restaurant')));

create policy rst_day_closeup_splits_select on public.rst_day_closeup_splits for select to authenticated
  using (company_id in (select public.user_company_ids()));
create policy rst_day_closeup_splits_insert on public.rst_day_closeup_splits for insert to authenticated
  with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_day_closeup_splits_module_gate on public.rst_day_closeup_splits as restrictive for all to authenticated
  using (company_id in (select public.user_module_company_ids('restaurant')))
  with check (company_id in (select public.user_module_company_ids('restaurant')));

-- One database step: check the figures, find or create the day total, attach the Close up and its splits. Runs with the caller's rights (row level security applies).
create or replace function public.rst_import_closeup(p_company uuid, p_date date, p_outlet text, p_payload jsonb)
returns uuid language plpgsql set search_path to 'public' as $$
declare
  d public.rst_sales_day_totals;
  day_id uuid;
  cu_id uuid;
  v_bills integer := (p_payload ->> 'bills')::integer;
  v_pax integer := (p_payload ->> 'pax')::integer;
  v_gross numeric(12,2) := (p_payload ->> 'gross')::numeric;
  v_discount numeric(12,2) := (p_payload ->> 'discount')::numeric;
  v_sc numeric(12,2) := (p_payload ->> 'service_charge')::numeric;
  v_sst numeric(12,2) := (p_payload ->> 'sst')::numeric;
  v_delivery numeric(12,2) := (p_payload ->> 'delivery_fee')::numeric;
  v_rounding numeric(12,2) := (p_payload ->> 'rounding')::numeric;
  v_nett numeric(12,2) := (p_payload ->> 'nett')::numeric;
  pay_sum numeric;
  chan_sum numeric;
begin
  if not public.rst_is_restaurant(p_company) then raise exception 'The Close up is only for the restaurant company.'; end if;
  if p_date >= (now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'Today is not finished yet. Import it tomorrow.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company::text || ':' || p_date::text, 0));

  if round((v_gross + v_discount + v_sc + v_sst + v_delivery + v_rounding) * 100) <> round(v_nett * 100) then
    raise exception 'The figures of this day do not add up to the Nett.';
  end if;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into pay_sum from jsonb_array_elements(p_payload -> 'payments') x;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into chan_sum from jsonb_array_elements(p_payload -> 'channels') x;
  if abs(pay_sum - v_nett) > 0.05 then raise exception 'The payment methods add up to RM %, not to the Nett of RM %.', pay_sum, v_nett; end if;
  if abs(chan_sum - v_nett) > 0.05 then raise exception 'The order types add up to RM %, not to the Nett of RM %.', chan_sum, v_nett; end if;

  select * into d from public.rst_sales_day_totals
    where company_id = p_company and source = 'feedme_overview' and sales_date = p_date and lower(outlet) = lower(p_outlet) and status <> 'cancelled'
    for update;
  if found then
    if (d.bills, d.pax, d.gross, d.discount, d.service_charge, d.sst, d.delivery_fee, d.rounding, d.nett)
       is distinct from (v_bills, v_pax, v_gross, v_discount, v_sc, v_sst, v_delivery, v_rounding, v_nett) then
      raise exception 'This day is already saved with other figures. Nothing was overwritten.';
    end if;
    if exists (select 1 from public.rst_day_closeups where day_total_id = d.id) then
      raise exception 'The Close up of this day is already imported.' using errcode = '23505';
    end if;
    day_id := d.id;
  else
    insert into public.rst_sales_day_totals (company_id, source, sales_date, outlet, bills, pax, gross, discount, service_charge, sst, delivery_fee, rounding, nett, source_file, manual_lines_ack, origin)
    values (p_company, 'feedme_overview', p_date, p_outlet, v_bills, v_pax, v_gross, v_discount, v_sc, v_sst, v_delivery, v_rounding, v_nett,
            p_payload ->> 'source_file', (p_payload ->> 'manual_lines_ack')::numeric, 'closeup')
    returning id into day_id;
  end if;

  insert into public.rst_day_closeups (company_id, day_total_id, sales_date, bills, pax, nett, void_bills, void_amount, refund_amount, source_file, created_by)
  values (p_company, day_id, p_date, v_bills, v_pax, v_nett, coalesce((p_payload ->> 'void_bills')::integer, 0), coalesce((p_payload ->> 'void_amount')::numeric, 0),
          coalesce((p_payload ->> 'refund_amount')::numeric, 0), p_payload ->> 'source_file', auth.uid())
  returning id into cu_id;

  insert into public.rst_day_closeup_splits (company_id, closeup_id, day_total_id, sales_date, kind, raw_label, mapped_key, qty, amount)
  select p_company, cu_id, day_id, p_date, 'payment', x ->> 'label', x ->> 'key', coalesce((x ->> 'qty')::integer, 0), (x ->> 'amount')::numeric
  from jsonb_array_elements(p_payload -> 'payments') x;
  insert into public.rst_day_closeup_splits (company_id, closeup_id, day_total_id, sales_date, kind, raw_label, mapped_key, qty, amount)
  select p_company, cu_id, day_id, p_date, 'channel', x ->> 'label', x ->> 'key', coalesce((x ->> 'qty')::integer, 0), (x ->> 'amount')::numeric
  from jsonb_array_elements(p_payload -> 'channels') x;

  return day_id;
end;
$$;
grant execute on function public.rst_import_closeup(uuid, date, text, jsonb) to authenticated;

-- Closing the cash: when the day has a CONFIRMED FeedMe day with a Close up, its CASH total is the cash sales of the day (only when the day has a
-- single cash session: a Close up is per day, not per shift). Otherwise, as before, the confirmed cash lines keyed in for the shift.
create or replace function public.rst_close_cash_session(p_session uuid, p_counted numeric, p_note text)
returns public.rst_cash_sessions language plpgsql security definer set search_path to 'public' as $$
declare
  s public.rst_cash_sessions;
  cash_in numeric(12,2);
  expected numeric(12,2);
  drafts integer;
  sessions_today integer;
  cu_cash numeric(12,2);
  cu_confirmed boolean;
  cu_waiting boolean;
begin
  select * into s from public.rst_cash_sessions where id = p_session for update;
  if not found then raise exception 'This cash session was not found.'; end if;
  if not (s.company_id in (select public.user_module_company_ids('restaurant'))) then raise exception 'You do not have access to this company.'; end if;
  if not public.rst_has_role(s.company_id, array['cashier', 'manager', 'finance']) then raise exception 'You do not have permission to close the cash.'; end if;
  if s.status = 'closed' then return s; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Enter the cash counted in the till.'; end if;

  select count(*) into sessions_today from public.rst_cash_sessions where company_id = s.company_id and session_date = s.session_date;
  select exists (
    select 1 from public.rst_day_closeups c join public.rst_sales_day_totals t on t.id = c.day_total_id
    where c.company_id = s.company_id and c.sales_date = s.session_date and t.status = 'confirmed'
  ) into cu_confirmed;
  select exists (
    select 1 from public.rst_day_closeups c join public.rst_sales_day_totals t on t.id = c.day_total_id
    where c.company_id = s.company_id and c.sales_date = s.session_date and t.status = 'draft'
  ) into cu_waiting;
  if cu_waiting then raise exception 'Confirm the imported FeedMe day of this date in Daily Sales first.'; end if;

  if cu_confirmed and sessions_today = 1 then
    select coalesce(sum(sp.amount), 0) into cu_cash from public.rst_day_closeup_splits sp
      join public.rst_day_closeups c on c.id = sp.closeup_id join public.rst_sales_day_totals t on t.id = c.day_total_id
      where sp.company_id = s.company_id and sp.sales_date = s.session_date and sp.kind = 'payment' and sp.mapped_key = 'cash' and t.status = 'confirmed';
    cash_in := cu_cash;
  else
    select count(*) into drafts from public.rst_sales_daily
      where company_id = s.company_id and sales_date = s.session_date and shift_no = s.shift_no and payment_method = 'cash' and status = 'draft';
    if drafts > 0 then raise exception 'Confirm or delete the draft cash sales lines of this shift first.'; end if;
    select coalesce(sum(gross_amount - discount_amount - refund_amount), 0) into cash_in from public.rst_sales_daily
      where company_id = s.company_id and sales_date = s.session_date and shift_no = s.shift_no and payment_method = 'cash' and status = 'confirmed';
  end if;

  expected := s.opening_cash + cash_in - s.cash_expenses - s.withdrawals;
  if round(p_counted - expected, 2) <> 0 and coalesce(btrim(p_note), '') = '' then
    raise exception 'The cash counted is different from the expected cash (RM % expected). Write the reason.', expected;
  end if;

  update public.rst_cash_sessions
    set status = 'closed', expected_closing = expected, counted_closing = p_counted, variance = round(p_counted - expected, 2),
        variance_note = nullif(btrim(p_note), ''), closed_by = auth.uid(), closed_at = now(), updated_at = now()
    where id = p_session returning * into s;
  return s;
end;
$$;
