create extension if not exists "pgcrypto";

create type user_role as enum ('super_admin', 'company_admin', 'dept_manager', 'staff');

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text not null unique,
  registration_no text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table user_company_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  role user_role not null default 'staff',
  granted_at timestamptz not null default now(),
  unique (user_id, company_id)
);

comment on column user_company_access.company_id is 'NULL means access to all companies';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_first boolean;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );

  select not exists (select 1 from public.user_company_access) into is_first;

  if is_first then
    insert into public.user_company_access (user_id, company_id, role)
    values (new.id, null, 'super_admin');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
