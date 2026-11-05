-- Push notifications to a phone or a computer (Web Push): who has switched them on, and the triggers that tell the server when something happens.

-- One row for each device a person has switched notifications on for.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The settings of the notification service: url (the address the triggers call), secret (sent with every call), vapid_public,
-- vapid_private and vapid_subject (the keys of the sender). Nobody can read this table except the service role (row level security is
-- on and there is no policy), and the values are put in by hand, not in this file.
create table public.push_settings (
  key text primary key,
  value text not null
);
alter table public.push_settings enable row level security;

create extension if not exists pg_net with schema extensions;

-- Tells the system (without waiting for it) that a row was added or changed; the system works out who is to be notified.
create or replace function public.push_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  u text;
  s text;
begin
  select value into u from public.push_settings where key = 'url';
  select value into s from public.push_settings where key = 'secret';
  if u is null or s is null then
    return null;
  end if;
  begin
    perform net.http_post(
      url := u,
      body := jsonb_build_object('table', tg_table_name, 'op', tg_op, 'record', to_jsonb(new), 'old', case when tg_op = 'UPDATE' then to_jsonb(old) else null end),
      headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', s)
    );
  exception when others then
    null; -- a notification problem never stops the work of the person
  end;
  return null;
end;
$$;
revoke all on function public.push_notify() from public, anon, authenticated;

create trigger push_priority_tasks after insert or update of responsible_id, status on public.priority_tasks for each row execute function public.push_notify();
create trigger push_approvals after insert or update of status on public.approvals for each row execute function public.push_notify();
create trigger push_payment_proofs after insert on public.payment_proof_submissions for each row execute function public.push_notify();
create trigger push_quotation_requests after insert on public.quotation_requests for each row execute function public.push_notify();
create trigger push_petty_cash after insert on public.petty_cash_transactions for each row execute function public.push_notify();
create trigger push_bulletin after insert on public.bulletin_posts for each row execute function public.push_notify();
