-- Bulletin Board: an announcement can mention one or more people (each gets a notification on the bell), and everybody who can read
-- an announcement can react to it (foreign staff too: they read and react; posting and editing stay with local staff and the admins).

alter table public.bulletin_posts add column if not exists mentions uuid[] not null default '{}';

create table if not exists public.bulletin_reactions (
  post_id uuid not null references public.bulletin_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '🙏', '👏')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
alter table public.bulletin_reactions enable row level security;

-- a reaction is seen by whoever can read the announcement (the announcement's own rules decide)
create policy bulletin_reactions_read on public.bulletin_reactions
  for select to authenticated
  using (exists (select 1 from public.bulletin_posts p where p.id = post_id));
create policy bulletin_reactions_add on public.bulletin_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.bulletin_posts p where p.id = post_id));
create policy bulletin_reactions_remove on public.bulletin_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- the people who can be mentioned: everyone with an account in a company the person can see
create or replace function public.bulletin_people()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public
as $$
  select distinct p.id, coalesce(nullif(trim(p.full_name), ''), p.email) as full_name
  from public.profiles p
  join public.user_company_access uca on uca.user_id = p.id
  where uca.company_id is null or uca.company_id in (select public.user_company_ids())
  order by 2;
$$;
revoke execute on function public.bulletin_people() from public, anon;
grant execute on function public.bulletin_people() to authenticated;

-- a new mention puts a notification on that person's bell (once per announcement)
create or replace function public.bulletin_notify_mentions()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.priority_notifications (user_id, company_id, item_type, item_id, period_key, severity, title, body, href)
  select m, new.company_id, 'bulletin_mention', new.id, 'mention', 'info',
         'You were mentioned: ' || left(new.title, 120),
         coalesce(nullif(new.created_by_name, ''), 'Someone') || ' mentioned you in an announcement on the Bulletin Board.',
         '/bulletin'
  from unnest(new.mentions) as m
  where m is not null
    and (tg_op = 'INSERT' or not (m = any (coalesce(old.mentions, '{}'))))
  on conflict (user_id, item_type, item_id, period_key) do nothing;
  return new;
end;
$$;

create trigger bulletin_posts_mentions
  after insert or update of mentions on public.bulletin_posts
  for each row execute function public.bulletin_notify_mentions();
