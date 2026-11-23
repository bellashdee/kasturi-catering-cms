-- Restaurant system, phase 1 (O2 Life only): daily sales by channel and payment method, cash sessions per shift, restaurant roles, audit events.
-- Additive only. Nothing here touches the catering companies: every table is scoped by company_id and every write needs a restaurant company.
-- Money is never counted twice: the daily rows are NOT added to monthly_sales (the monthly Total Sales of the Monthly Breakdown); the dashboard shows them side by side.
-- Completed records are never deleted: a confirmed sales line can only be cancelled (reason, manager) and a closed cash session reopened (reason, manager).

alter table public.companies add column if not exists is_restaurant boolean not null default false;
update public.companies set is_restaurant = true where name = 'O2 Life' and is_restaurant = false;

-- ---------------------------------------------------------------- helpers
create or replace function public.rst_is_restaurant(target_company_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select is_restaurant from public.companies where id = target_company_id), false);
$$;

create table if not exists public.rst_staff_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('manager', 'cashier', 'chef', 'kitchen_staff', 'purchasing', 'storekeeper', 'finance')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, company_id, role)
);
create index if not exists rst_staff_roles_company_idx on public.rst_staff_roles (company_id);

-- Owner / Admin (super_admin, company_admin) always pass; the other roles come from rst_staff_roles
create or replace function public.rst_has_role(target_company_id uuid, roles text[])
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.user_is_company_admin(target_company_id)
    or exists (
      select 1 from public.rst_staff_roles r
      where r.user_id = auth.uid() and r.company_id = target_company_id and r.role = any (roles)
    );
$$;

-- ---------------------------------------------------------------- audit events (insert-only, filled by triggers)
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete cascade,
  table_name text not null,
  record_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  actor uuid,
  at timestamptz not null default now()
);
create index if not exists audit_events_company_at_idx on public.audit_events (company_id, at desc);
create index if not exists audit_events_record_idx on public.audit_events (table_name, record_id);

create or replace function public.rst_audit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.audit_events (company_id, table_name, record_id, action, before, after, actor)
  values (
    coalesce(new.company_id, old.company_id),
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------- daily sales
create table if not exists public.rst_sales_daily (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sales_date date not null,
  shift_no smallint not null default 1 check (shift_no between 1 and 9),
  channel text not null check (channel in ('dine_in', 'takeaway', 'delivery', 'online')),
  payment_method text not null check (payment_method in ('cash', 'qr_duitnow', 'card', 'online_platform', 'other')),
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  refund_amount numeric(12,2) not null default 0 check (refund_amount >= 0),
  orders_count integer check (orders_count is null or orders_count >= 0),
  source text not null default 'manual' check (source in ('manual', 'import', 'pos')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  notes text,
  cancel_reason text,
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_amount + refund_amount <= gross_amount)
);
-- the same day, shift, channel and payment method can only be there once (a cancelled line does not count), so a double entry is refused
create unique index if not exists rst_sales_daily_once on public.rst_sales_daily (company_id, sales_date, shift_no, channel, payment_method) where status <> 'cancelled';
create index if not exists rst_sales_daily_company_date_idx on public.rst_sales_daily (company_id, sales_date);

create or replace function public.rst_sales_daily_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.created_by := auth.uid();
    new.confirmed_by := null; new.confirmed_at := null; new.cancelled_by := null; new.cancelled_at := null; new.cancel_reason := null;
    if not public.rst_is_restaurant(new.company_id) then
      raise exception 'Daily sales are only for the restaurant company.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'A confirmed or cancelled sales line cannot be deleted. Cancel it with a reason instead.';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.company_id <> old.company_id then raise exception 'The company of a sales line cannot be changed.'; end if;
  new.updated_at := now();

  if old.status = 'cancelled' then
    raise exception 'A cancelled sales line cannot be changed.';
  elsif old.status = 'confirmed' then
    if new.status <> 'cancelled' then
      raise exception 'A confirmed sales line cannot be edited. Cancel it with a reason and enter it again.';
    end if;
    if not public.rst_has_role(old.company_id, array['manager']) then
      raise exception 'Only a Manager or an Admin can cancel a confirmed sales line.';
    end if;
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'Write the reason for cancelling.';
    end if;
    if (new.sales_date, new.shift_no, new.channel, new.payment_method, new.gross_amount, new.discount_amount, new.refund_amount, new.orders_count, new.source)
       is distinct from (old.sales_date, old.shift_no, old.channel, old.payment_method, old.gross_amount, old.discount_amount, old.refund_amount, old.orders_count, old.source) then
      raise exception 'Only the status and the reason can change when a sales line is cancelled.';
    end if;
    new.cancelled_by := auth.uid();
    new.cancelled_at := now();
  else
    -- draft: amounts may change; it may be confirmed
    if new.status = 'confirmed' then
      new.confirmed_by := auth.uid();
      new.confirmed_at := now();
    elsif new.status = 'cancelled' then
      raise exception 'A draft line is deleted, not cancelled.';
    end if;
  end if;
  return new;
end;
$$;

create trigger rst_sales_daily_guard_trg before insert or update or delete on public.rst_sales_daily
  for each row execute function public.rst_sales_daily_guard();
create trigger rst_sales_daily_audit_trg after insert or update or delete on public.rst_sales_daily
  for each row execute function public.rst_audit();

-- ---------------------------------------------------------------- cash sessions
create table if not exists public.rst_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_date date not null,
  shift_no smallint not null default 1 check (shift_no between 1 and 9),
  opening_cash numeric(12,2) not null check (opening_cash >= 0),
  cash_expenses numeric(12,2) not null default 0 check (cash_expenses >= 0),
  withdrawals numeric(12,2) not null default 0 check (withdrawals >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  expected_closing numeric(12,2),
  counted_closing numeric(12,2) check (counted_closing is null or counted_closing >= 0),
  variance numeric(12,2),
  variance_note text,
  reopen_reason text,
  opened_by uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, session_date, shift_no)
);
create index if not exists rst_cash_sessions_company_date_idx on public.rst_cash_sessions (company_id, session_date);

create or replace function public.rst_cash_sessions_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if not public.rst_is_restaurant(new.company_id) then
      raise exception 'Cash sessions are only for the restaurant company.';
    end if;
    new.status := 'open';
    new.opened_by := auth.uid();
    new.expected_closing := null; new.counted_closing := null; new.variance := null; new.closed_by := null; new.closed_at := null;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'A cash session cannot be deleted.';
  end if;
  new.updated_at := now();
  -- the closing figures only exist on a closed session, and only the closing function writes them
  if new.status = 'open' then
    new.expected_closing := null; new.counted_closing := null; new.variance := null; new.closed_by := null; new.closed_at := null;
  end if;
  return new;
end;
$$;
create trigger rst_cash_sessions_guard_trg before insert or update or delete on public.rst_cash_sessions
  for each row execute function public.rst_cash_sessions_guard();
create trigger rst_cash_sessions_audit_trg after insert or update or delete on public.rst_cash_sessions
  for each row execute function public.rst_audit();

create trigger rst_staff_roles_audit_trg after insert or update or delete on public.rst_staff_roles
  for each row execute function public.rst_audit();

-- Closing and reopening are ONE database step each (idempotent: closing a closed session returns it unchanged).
-- Expected closing cash = opening cash + cash sales of the day and shift (gross - discount - refund, confirmed lines) - cash expenses - withdrawals.
create or replace function public.rst_close_cash_session(p_session uuid, p_counted numeric, p_note text)
returns public.rst_cash_sessions language plpgsql security definer set search_path to 'public' as $$
declare
  s public.rst_cash_sessions;
  cash_in numeric(12,2);
  expected numeric(12,2);
  drafts integer;
begin
  select * into s from public.rst_cash_sessions where id = p_session for update;
  if not found then raise exception 'This cash session was not found.'; end if;
  if not (s.company_id in (select public.user_module_company_ids('restaurant'))) then raise exception 'You do not have access to this company.'; end if;
  if not public.rst_has_role(s.company_id, array['cashier', 'manager', 'finance']) then raise exception 'You do not have permission to close the cash.'; end if;
  if s.status = 'closed' then return s; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Enter the cash counted in the till.'; end if;

  select count(*) into drafts from public.rst_sales_daily
    where company_id = s.company_id and sales_date = s.session_date and shift_no = s.shift_no and payment_method = 'cash' and status = 'draft';
  if drafts > 0 then raise exception 'Confirm or delete the draft cash sales lines of this shift first.'; end if;

  select coalesce(sum(gross_amount - discount_amount - refund_amount), 0) into cash_in from public.rst_sales_daily
    where company_id = s.company_id and sales_date = s.session_date and shift_no = s.shift_no and payment_method = 'cash' and status = 'confirmed';

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

create or replace function public.rst_reopen_cash_session(p_session uuid, p_reason text)
returns public.rst_cash_sessions language plpgsql security definer set search_path to 'public' as $$
declare s public.rst_cash_sessions;
begin
  select * into s from public.rst_cash_sessions where id = p_session for update;
  if not found then raise exception 'This cash session was not found.'; end if;
  if not public.rst_has_role(s.company_id, array['manager']) then raise exception 'Only a Manager or an Admin can reopen a closed cash session.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Write the reason for reopening.'; end if;
  if s.status = 'open' then return s; end if;
  update public.rst_cash_sessions
    set status = 'open', reopen_reason = btrim(p_reason), expected_closing = null, counted_closing = null, variance = null, closed_by = null, closed_at = null, updated_at = now()
    where id = p_session returning * into s;
  return s;
end;
$$;

-- ---------------------------------------------------------------- row level security
alter table public.rst_staff_roles enable row level security;
alter table public.audit_events enable row level security;
alter table public.rst_sales_daily enable row level security;
alter table public.rst_cash_sessions enable row level security;

-- roles: a person reads their own; admins read and manage all of the company
create policy rst_staff_roles_select on public.rst_staff_roles for select to authenticated
  using (user_id = (select auth.uid()) or company_id in (select public.user_admin_company_ids()));
create policy rst_staff_roles_insert on public.rst_staff_roles for insert to authenticated
  with check (company_id in (select public.user_admin_company_ids()) and public.rst_is_restaurant(company_id));
create policy rst_staff_roles_delete on public.rst_staff_roles for delete to authenticated
  using (company_id in (select public.user_admin_company_ids()));

-- audit: managers, finance and admins read; nobody writes directly (the triggers do)
create policy audit_events_select on public.audit_events for select to authenticated
  using (company_id is not null and public.rst_has_role(company_id, array['manager', 'finance']));

-- sales lines
create policy rst_sales_daily_select on public.rst_sales_daily for select to authenticated
  using (company_id in (select public.user_company_ids()));
create policy rst_sales_daily_insert on public.rst_sales_daily for insert to authenticated
  with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_sales_daily_update on public.rst_sales_daily for update to authenticated
  using (public.rst_has_role(company_id, array['cashier', 'manager', 'finance']))
  with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_sales_daily_delete on public.rst_sales_daily for delete to authenticated
  using (status = 'draft' and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_sales_daily_module_gate on public.rst_sales_daily as restrictive for all to authenticated
  using (company_id in (select public.user_module_company_ids('restaurant')))
  with check (company_id in (select public.user_module_company_ids('restaurant')));

-- cash sessions: while open they can be edited; closing and reopening only through the two functions above
create policy rst_cash_sessions_select on public.rst_cash_sessions for select to authenticated
  using (company_id in (select public.user_company_ids()));
create policy rst_cash_sessions_insert on public.rst_cash_sessions for insert to authenticated
  with check (public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_cash_sessions_update on public.rst_cash_sessions for update to authenticated
  using (status = 'open' and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']))
  with check (status = 'open' and public.rst_is_restaurant(company_id) and public.rst_has_role(company_id, array['cashier', 'manager', 'finance']));
create policy rst_cash_sessions_module_gate on public.rst_cash_sessions as restrictive for all to authenticated
  using (company_id in (select public.user_module_company_ids('restaurant')))
  with check (company_id in (select public.user_module_company_ids('restaurant')));

grant execute on function public.rst_close_cash_session(uuid, numeric, text) to authenticated;
grant execute on function public.rst_reopen_cash_session(uuid, text) to authenticated;
grant execute on function public.rst_is_restaurant(uuid) to authenticated;
grant execute on function public.rst_has_role(uuid, text[]) to authenticated;
