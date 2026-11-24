-- Vendor Contact List of the catering business (Supplier & Procurement → Vendor Contacts): bakers, transport, photographers,
-- canopy, decoration and the other vendors used for events, listed by category. One list shared by Signature Solution Sdn Bhd
-- and Kasturi Indah Sdn Bhd: anyone with Supplier & Procurement access in either company sees and keeps the same list.
create table if not exists public.vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  contact_person text,
  address text,
  phone text,
  cell_phone text,
  email text,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vendor_contacts_category_idx on public.vendor_contacts (category, lower(name));

create or replace function public.user_can_use_vendor_contacts()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies c
    where (c.name ilike 'signature solution%' or c.name ilike 'kasturi indah%')
      and public.user_has_company_access(c.id)
      and public.user_has_module(c.id, 'supplier-procurement')
  );
$$;
revoke all on function public.user_can_use_vendor_contacts() from public;
grant execute on function public.user_can_use_vendor_contacts() to authenticated;

create or replace function public.vendor_contacts_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists vendor_contacts_touch on public.vendor_contacts;
create trigger vendor_contacts_touch before update on public.vendor_contacts for each row execute function public.vendor_contacts_touch();

alter table public.vendor_contacts enable row level security;
drop policy if exists vendor_contacts_all on public.vendor_contacts;
create policy vendor_contacts_all on public.vendor_contacts for all to authenticated
  using (public.user_can_use_vendor_contacts()) with check (public.user_can_use_vendor_contacts());
