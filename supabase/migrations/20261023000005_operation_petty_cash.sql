-- Operation Management petty cash: the float is held by Mr. Reza (Operation). The money received (top-ups) and what was spent
-- (with the receipt) are recorded here. Only the holder, and the Director of Finance and her assistant (who pay the float and check it),
-- can see or change these records: everybody else is blocked by the database itself.
create table if not exists public.operation_petty_cash_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.operation_petty_cash_access enable row level security;
drop policy if exists operation_petty_cash_access_own on public.operation_petty_cash_access;
create policy operation_petty_cash_access_own on public.operation_petty_cash_access for select to authenticated using (user_id = auth.uid());

create or replace function public.user_can_use_operation_petty_cash() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operation_petty_cash_access where user_id = auth.uid());
$$;
revoke execute on function public.user_can_use_operation_petty_cash() from anon, public;
grant execute on function public.user_can_use_operation_petty_cash() to authenticated;

insert into public.operation_petty_cash_access (user_id, note)
select id, note from (values
  ('264c2671-9e46-4ecc-8fab-494bc9703a13'::uuid, 'Mr. Reza - holds the Operation petty cash'),
  ('2e6cc396-a0f7-406b-82ad-bc1241c33ef0'::uuid, 'Ms. Penny Chan - Director of Finance'),
  ('296343b8-f5a1-4226-9d0c-41c75c99bf2a'::uuid, 'Ms. Nabilah - PA to the Director of Finance')
) as v(id, note)
where exists (select 1 from auth.users u where u.id = v.id)
on conflict (user_id) do nothing;

create table public.operation_petty_cash (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  entry_type text not null check (entry_type in ('top_up', 'expense')),
  entry_date date not null,
  category text,
  description text,
  amount numeric(12, 2) not null check (amount > 0),
  document_id uuid references public.documents (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index operation_petty_cash_company_date_idx on public.operation_petty_cash (company_id, entry_date desc);

alter table public.operation_petty_cash enable row level security;
create policy operation_petty_cash_all on public.operation_petty_cash for all to authenticated
  using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
create policy operation_petty_cash_holders_only on public.operation_petty_cash as restrictive for all to authenticated
  using (public.user_can_use_operation_petty_cash()) with check (public.user_can_use_operation_petty_cash());
