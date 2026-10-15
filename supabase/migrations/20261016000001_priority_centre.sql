-- Madam Penny's Priority Centre: to-do checklist, supplier-payment controls (priority override, hold, verification,
-- operational alerts), a payment ledger that works for both supplier invoices and Finance supplier payments, and reminders.
-- Additive only: nothing is dropped, no existing row is changed.

-- ───────────────────────── 1. To-do checklist ─────────────────────────
create table public.priority_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  title text not null check (length(btrim(title)) > 0),
  description text,
  responsible_id uuid references public.profiles(id),
  department text,
  priority text not null default 'medium' check (priority in ('urgent', 'high', 'medium', 'low')),
  start_date date,
  due_at timestamptz,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'waiting_approval', 'completed', 'cancelled')),
  reminder_at timestamptz,
  document_id uuid references public.documents(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);
create index priority_tasks_company_status_idx on public.priority_tasks (company_id, status, due_at);
create index priority_tasks_responsible_idx on public.priority_tasks (responsible_id, status);

create trigger priority_tasks_set_updated_at before update on public.priority_tasks
  for each row execute function public.set_updated_at();

alter table public.priority_tasks enable row level security;

-- admins of the company see every task; other people only the tasks assigned to them or created by them
create policy priority_tasks_select on public.priority_tasks for select using (
  public.user_has_company_access(company_id)
  and (public.user_is_company_admin(company_id) or responsible_id = auth.uid() or created_by = auth.uid())
);
-- admins create tasks for anybody; other people only for themselves
create policy priority_tasks_insert on public.priority_tasks for insert with check (
  public.user_has_company_access(company_id)
  and created_by = auth.uid()
  and (public.user_is_company_admin(company_id) or responsible_id = auth.uid())
);
create policy priority_tasks_update on public.priority_tasks for update using (
  public.user_has_company_access(company_id)
  and (public.user_is_company_admin(company_id) or responsible_id = auth.uid() or created_by = auth.uid())
) with check (public.user_has_company_access(company_id));
create policy priority_tasks_delete on public.priority_tasks for delete using (
  public.user_is_company_admin(company_id) and status <> 'completed'
);

-- ───────────────────── 2. Supplier payment controls ─────────────────────
-- One row per payable (a Finance supplier payment or a supplier invoice) holding what people decided about it.
create table public.supplier_payment_controls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  payable_type text not null check (payable_type in ('finance_payment', 'supplier_invoice')),
  payable_id uuid not null,
  is_urgent boolean not null default false,
  urgent_reason text,
  priority_override text check (priority_override in ('urgent', 'high', 'medium', 'low')),
  override_reason text,
  override_by uuid references public.profiles(id),
  override_at timestamptz,
  hold_status text check (hold_status in ('on_hold', 'disputed')),
  hold_reason text,
  hold_by uuid references public.profiles(id),
  hold_at timestamptz,
  verified_amount numeric(14, 2),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  ops_alert_type text check (ops_alert_type in ('supplier_blocked', 'refuses_orders', 'event_affected')),
  ops_alert_note text,
  ops_alert_event_id uuid references public.catering_events(id),
  ops_alert_by uuid references public.profiles(id),
  ops_alert_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  unique (payable_type, payable_id),
  check (priority_override is null or length(btrim(coalesce(override_reason, ''))) > 0),
  check (hold_status is null or length(btrim(coalesce(hold_reason, ''))) > 0)
);
create index supplier_payment_controls_company_idx on public.supplier_payment_controls (company_id);

create trigger supplier_payment_controls_set_updated_at before update on public.supplier_payment_controls
  for each row execute function public.set_updated_at();

alter table public.supplier_payment_controls enable row level security;
create policy supplier_payment_controls_select on public.supplier_payment_controls for select using (public.user_is_company_admin(company_id));
create policy supplier_payment_controls_insert on public.supplier_payment_controls for insert with check (public.user_is_company_admin(company_id));
create policy supplier_payment_controls_update on public.supplier_payment_controls for update using (public.user_is_company_admin(company_id)) with check (public.user_is_company_admin(company_id));

-- ───────────────────────── 3. Payment ledger ─────────────────────────
-- supplier_payments already holds payment requests, Madam Penny's decision (via approvals) and the confirmed payment of a
-- supplier invoice. It now also serves Finance supplier payments (finance_payments), so partial and multiple payments work
-- for both. Exactly one of the two links is set.
alter table public.supplier_payments alter column supplier_invoice_id drop not null;
alter table public.supplier_payments add column finance_payment_id uuid references public.finance_payments(id);
alter table public.supplier_payments add constraint supplier_payments_one_payable
  check ((supplier_invoice_id is not null)::int + (finance_payment_id is not null)::int = 1);
alter table public.supplier_payments add column decided_by uuid references public.profiles(id);
alter table public.supplier_payments add column decided_at timestamptz;
alter table public.supplier_payments add column decision_note text;
alter table public.supplier_payments add column processing_by uuid references public.profiles(id);
alter table public.supplier_payments add column processing_at timestamptz;
alter table public.supplier_payments add column confirmed_by uuid references public.profiles(id);
alter table public.supplier_payments add column confirmed_at timestamptz;
alter table public.supplier_payments add column notes text;

alter table public.supplier_payments drop constraint supplier_payments_status_check;
alter table public.supplier_payments add constraint supplier_payments_status_check
  check (status = any (array['pending', 'approved', 'processing', 'paid', 'rejected']));

create index supplier_payments_finance_payment_idx on public.supplier_payments (finance_payment_id) where finance_payment_id is not null;
-- the same bank/transaction reference cannot be recorded twice against the same payable
create unique index supplier_payments_unique_reference on public.supplier_payments
  (coalesce(supplier_invoice_id, finance_payment_id), lower(btrim(reference_number)))
  where reference_number is not null and btrim(reference_number) <> '' and status in ('pending', 'approved', 'processing', 'paid');

-- ───────────────────────── 4. Reminders ─────────────────────────
create table public.priority_reminder_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  days_before integer[] not null default '{7,3,1,0}',
  remind_after_deadline boolean not null default true,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger priority_reminder_settings_set_updated_at before update on public.priority_reminder_settings
  for each row execute function public.set_updated_at();
alter table public.priority_reminder_settings enable row level security;
create policy priority_reminder_settings_own on public.priority_reminder_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- one notification per person, item and reminder period (the unique key is what prevents duplicates)
create table public.priority_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id),
  item_type text not null,
  item_id text not null,
  period_key text not null,
  severity text not null default 'info' check (severity in ('danger', 'warning', 'info')),
  title text not null,
  body text,
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, item_type, item_id, period_key)
);
create index priority_notifications_user_idx on public.priority_notifications (user_id, read_at, created_at desc);
alter table public.priority_notifications enable row level security;
create policy priority_notifications_own on public.priority_notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
