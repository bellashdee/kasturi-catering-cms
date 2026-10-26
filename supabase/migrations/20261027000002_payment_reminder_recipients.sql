-- The reminders about supplier payments that are outstanding (overdue, due soon, waiting for approval) go only to the Director of Finance
-- (Madam Penny Chan), because she is the one who pays the suppliers. Nobody else is reminded.
create table if not exists public.payment_reminder_recipients (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.payment_reminder_recipients enable row level security;
drop policy if exists payment_reminder_recipients_own on public.payment_reminder_recipients;
create policy payment_reminder_recipients_own on public.payment_reminder_recipients for select to authenticated using (user_id = auth.uid());

insert into public.payment_reminder_recipients (user_id, note)
select id, 'Madam Penny Chan - Director of Finance' from auth.users where id = '2e6cc396-a0f7-406b-82ad-bc1241c33ef0'
on conflict (user_id) do nothing;

create or replace function public.user_gets_payment_reminders() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payment_reminder_recipients where user_id = auth.uid());
$$;
revoke execute on function public.user_gets_payment_reminders() from public, anon;
grant execute on function public.user_gets_payment_reminders() to authenticated;

-- the supplier payment reminders already waiting in the bell of everybody else are closed
update public.priority_notifications set read_at = now()
where read_at is null and item_type in ('payable', 'ops', 'approval')
  and user_id not in (select user_id from public.payment_reminder_recipients);
