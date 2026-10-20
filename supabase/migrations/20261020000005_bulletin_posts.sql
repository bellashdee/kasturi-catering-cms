-- Bulletin board: news about the company and the work that every staff member can read.
-- company_id null = for every company. Super Admins post for everybody, Company Admins for their own companies.
create table if not exists public.bulletin_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  body text not null check (char_length(body) between 1 and 4000),
  category text not null default 'general' check (category in ('company', 'work', 'event', 'hr', 'holiday', 'safety', 'general')),
  pinned boolean not null default false,
  expires_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bulletin_posts_company_created_idx on public.bulletin_posts (company_id, created_at desc);

alter table public.bulletin_posts enable row level security;

create policy bulletin_posts_read on public.bulletin_posts for select to authenticated
  using (company_id is null or public.user_has_company_access(company_id));

create policy bulletin_posts_insert on public.bulletin_posts for insert to authenticated
  with check (case when company_id is null then public.current_user_is_super_admin() else public.user_is_company_admin(company_id) end);

create policy bulletin_posts_update on public.bulletin_posts for update to authenticated
  using (case when company_id is null then public.current_user_is_super_admin() else public.user_is_company_admin(company_id) end)
  with check (case when company_id is null then public.current_user_is_super_admin() else public.user_is_company_admin(company_id) end);

create policy bulletin_posts_delete on public.bulletin_posts for delete to authenticated
  using (case when company_id is null then public.current_user_is_super_admin() else public.user_is_company_admin(company_id) end);

create or replace function public.bulletin_posts_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger bulletin_posts_touch before update on public.bulletin_posts for each row execute function public.bulletin_posts_touch();
