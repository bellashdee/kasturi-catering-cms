-- The AI Kitchen Assistant keeps the menu, pax and recipe choices of one conversation, so a follow-up ("change the pax to 300")
-- recalculates without the photo being uploaded again. One row per assistant conversation, private to its owner.
create table public.ai_kitchen_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid references public.catering_events (id) on delete set null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_kitchen_sessions enable row level security;

create policy ai_kitchen_sessions_own_select on public.ai_kitchen_sessions for select to authenticated using (user_id = auth.uid());
create policy ai_kitchen_sessions_own_insert on public.ai_kitchen_sessions for insert to authenticated with check (user_id = auth.uid() and public.user_has_company_access(company_id));
create policy ai_kitchen_sessions_own_update on public.ai_kitchen_sessions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.user_has_company_access(company_id));
create policy ai_kitchen_sessions_own_delete on public.ai_kitchen_sessions for delete to authenticated using (user_id = auth.uid());
