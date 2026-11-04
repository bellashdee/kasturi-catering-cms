-- Quotation Request Inbox: only the people on quotation_request_access (Ms. Nabilah, Mr. Adlan and Ms. Penny) can see and work on
-- the requests sales agents send through the public form. Being an admin gives no access. The public form still writes through the
-- server (service role), so nothing changes for the sales agents. Requests never create events; the office tracks the AutoCount
-- quotation / invoice here. Existing requests are kept: they get a Request ID and a tracking status, nothing is deleted or dropped.

-- 1) who may open the inbox (verified user IDs, not names or roles)
create table public.quotation_request_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.quotation_request_access enable row level security;
create policy quotation_request_access_own on public.quotation_request_access for select to authenticated using (user_id = auth.uid());

insert into public.quotation_request_access (user_id, note)
select v.id, v.note
from (values
  ('296343b8-f5a1-4226-9d0c-41c75c99bf2a'::uuid, 'Ms. Nabilah'),
  ('0cebe546-3d50-44e8-ab51-e23d2082e23d'::uuid, 'Mr. Adlan'),
  ('2e6cc396-a0f7-406b-82ad-bc1241c33ef0'::uuid, 'Ms. Penny')
) as v(id, note)
where exists (select 1 from auth.users u where u.id = v.id);

create function public.user_has_quotation_request_access()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.quotation_request_access where user_id = auth.uid());
$$;
revoke execute on function public.user_has_quotation_request_access() from public, anon;
grant execute on function public.user_has_quotation_request_access() to authenticated;

-- 2) the requests: only the access list reads or changes them (company access alone is no longer enough)
alter policy "quotation_requests_select" on quotation_requests
  using (public.user_has_quotation_request_access());
alter policy "quotation_requests_update" on quotation_requests
  using (public.user_has_quotation_request_access())
  with check (public.user_has_quotation_request_access());

-- 3) Request ID: QR-<year>-0001, numbered per year (Malaysia time) in the order the requests came in
alter table quotation_requests add column request_code text;

with numbered as (
  select id,
         to_char(created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY') as yr,
         row_number() over (partition by to_char(created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY') order by created_at, id) as n
  from quotation_requests
)
update quotation_requests q
set request_code = 'QR-' || numbered.yr || '-' || lpad(numbered.n::text, 4, '0')
from numbered
where q.id = numbered.id;

create unique index quotation_requests_request_code_key on quotation_requests (request_code);

create function public.quotation_requests_set_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  yr text := to_char(coalesce(new.created_at, now()) at time zone 'Asia/Kuala_Lumpur', 'YYYY');
  n int;
begin
  if new.request_code is null then
    -- one number at a time, so two requests sent at the same moment never get the same ID
    perform pg_advisory_xact_lock(hashtext('quotation_request_code'));
    select coalesce(max(substring(request_code from 9)::int), 0) + 1 into n
    from quotation_requests where request_code like 'QR-' || yr || '-%';
    new.request_code := 'QR-' || yr || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;
create trigger quotation_requests_set_code before insert on quotation_requests for each row execute function public.quotation_requests_set_code();

-- 4) tracking: status, the AutoCount references, the dates and who is handling it
alter table quotation_requests
  add column tracking_status text not null default 'new_request',
  add column autocount_quotation_no text,
  add column autocount_invoice_no text,
  add column quotation_prepared_on date,
  add column sent_to_customer_on date,
  add column customer_response_on date,
  add column follow_up_on date,
  add column handled_by uuid references profiles(id) on delete set null,
  add column updated_at timestamptz,
  add column updated_by uuid references profiles(id) on delete set null;

alter table quotation_requests add constraint quotation_requests_tracking_status_check check (tracking_status in (
  'new_request', 'under_review', 'need_more_info', 'quotation_prepared', 'sent_to_customer',
  'follow_up_required', 'customer_confirmed', 'customer_declined', 'cancelled'
));

-- requests reviewed before: approved ones already had a quotation made, rejected ones are cancelled
update quotation_requests set tracking_status = 'quotation_prepared' where status = 'approved';
update quotation_requests set tracking_status = 'cancelled' where status = 'rejected';

create index quotation_requests_tracking_idx on quotation_requests (tracking_status, created_at desc);

-- 5) internal notes: only the access list can read or write them; each note keeps who wrote / changed it
create table public.quotation_request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references quotation_requests(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz
);
create index quotation_request_notes_request_idx on public.quotation_request_notes (request_id, created_at);
alter table public.quotation_request_notes enable row level security;
create policy quotation_request_notes_select on public.quotation_request_notes for select to authenticated using (public.user_has_quotation_request_access());
create policy quotation_request_notes_insert on public.quotation_request_notes for insert to authenticated with check (public.user_has_quotation_request_access() and created_by = auth.uid());
create policy quotation_request_notes_update on public.quotation_request_notes for update to authenticated using (public.user_has_quotation_request_access()) with check (public.user_has_quotation_request_access());
create policy quotation_request_notes_delete on public.quotation_request_notes for delete to authenticated using (public.user_has_quotation_request_access() and created_by = auth.uid());

-- 6) history of every change (status, references, dates, handler, notes); readable by the access list only, never edited
create table public.quotation_request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references quotation_requests(id) on delete cascade,
  changed_by uuid default auth.uid() references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  field text not null,
  old_value text,
  new_value text
);
create index quotation_request_history_request_idx on public.quotation_request_history (request_id, changed_at desc);
alter table public.quotation_request_history enable row level security;
create policy quotation_request_history_select on public.quotation_request_history for select to authenticated using (public.user_has_quotation_request_access());
create policy quotation_request_history_insert on public.quotation_request_history for insert to authenticated with check (public.user_has_quotation_request_access() and changed_by = auth.uid());

-- 7) the people who can open the inbox, by name (for "handled by"); only they can list it
create function public.quotation_request_people()
returns table (user_id uuid, full_name text) language sql stable security definer set search_path = public as $$
  select a.user_id, p.full_name
  from public.quotation_request_access a left join public.profiles p on p.id = a.user_id
  where public.user_has_quotation_request_access()
  order by p.full_name;
$$;
revoke execute on function public.quotation_request_people() from public, anon;
grant execute on function public.quotation_request_people() to authenticated;
