-- Vendor Contacts: the items (products / services) a vendor offers and their prices, e.g. a baker's cakes, a canopy rental's sizes.
-- Kept as typed by the person (a price list for reference, not a purchase). Same access as the vendor itself.
create table if not exists public.vendor_contact_items (
  id uuid primary key default gen_random_uuid(),
  vendor_contact_id uuid not null references public.vendor_contacts (id) on delete cascade,
  item text not null check (char_length(item) between 1 and 200),
  unit text,
  price numeric(12, 2) check (price is null or price >= 0),
  notes text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vendor_contact_items_vendor_idx on public.vendor_contact_items (vendor_contact_id, sort_order);

drop trigger if exists vendor_contact_items_touch on public.vendor_contact_items;
create trigger vendor_contact_items_touch before update on public.vendor_contact_items for each row execute function public.vendor_contacts_touch();

alter table public.vendor_contact_items enable row level security;
drop policy if exists vendor_contact_items_all on public.vendor_contact_items;
create policy vendor_contact_items_all on public.vendor_contact_items for all to authenticated
  using (public.user_can_use_vendor_contacts()) with check (public.user_can_use_vendor_contacts());
