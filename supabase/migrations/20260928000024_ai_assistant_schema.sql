create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_id_idx on ai_conversations(user_id);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  page_context text,
  helpful boolean,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_id_idx on ai_messages(conversation_id);

alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;

create policy ai_conversations_own_select on ai_conversations for select using (user_id = auth.uid());
create policy ai_conversations_own_insert on ai_conversations for insert with check (user_id = auth.uid());
create policy ai_conversations_own_update on ai_conversations for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_conversations_own_delete on ai_conversations for delete using (user_id = auth.uid());

create policy ai_messages_own_select on ai_messages for select using (
  exists (select 1 from ai_conversations c where c.id = ai_messages.conversation_id and c.user_id = auth.uid())
);
create policy ai_messages_own_insert on ai_messages for insert with check (
  exists (select 1 from ai_conversations c where c.id = ai_messages.conversation_id and c.user_id = auth.uid())
);
create policy ai_messages_own_update on ai_messages for update using (
  exists (select 1 from ai_conversations c where c.id = ai_messages.conversation_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from ai_conversations c where c.id = ai_messages.conversation_id and c.user_id = auth.uid())
);
create policy ai_messages_own_delete on ai_messages for delete using (
  exists (select 1 from ai_conversations c where c.id = ai_messages.conversation_id and c.user_id = auth.uid())
);
