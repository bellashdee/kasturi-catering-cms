-- WhatsApp Message Import (Signature Solution only): every pasted message from the Boss is kept with what the AI read and what the
-- Admin changed, whether it was a quotation request, JDT match dates or a JDT training snack request. Only additions.
create table if not exists public.whatsapp_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  original_message text not null,
  category text not null check (category in ('quotation', 'jdt_match', 'snack')),
  ai_category text check (ai_category in ('quotation', 'jdt_match', 'snack')),
  ai_result jsonb,
  edited_result jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'discarded')),
  quotation_request_id uuid references public.quotation_requests(id) on delete set null,
  event_ids uuid[] not null default '{}',
  snack_request_id uuid,
  imported_by uuid references auth.users(id) default auth.uid(),
  imported_at timestamptz not null default now(),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_imports_company_idx on public.whatsapp_imports (company_id, imported_at desc);

alter table public.whatsapp_imports enable row level security;
-- the Quotation Request people (Admin / Management) of the company read and write them; nobody deletes (kept for the audit trail)
drop policy if exists whatsapp_imports_select on public.whatsapp_imports;
create policy whatsapp_imports_select on public.whatsapp_imports for select
  using (public.user_has_quotation_request_access() and company_id in (select public.user_company_ids()));
drop policy if exists whatsapp_imports_insert on public.whatsapp_imports;
create policy whatsapp_imports_insert on public.whatsapp_imports for insert
  with check (public.user_has_quotation_request_access() and company_id in (select public.user_company_ids()));
drop policy if exists whatsapp_imports_update on public.whatsapp_imports;
create policy whatsapp_imports_update on public.whatsapp_imports for update
  using (public.user_has_quotation_request_access() and company_id in (select public.user_company_ids()));

drop trigger if exists whatsapp_imports_set_updated_at on public.whatsapp_imports;
create trigger whatsapp_imports_set_updated_at before update on public.whatsapp_imports for each row execute function public.set_updated_at();

-- a quotation request made from a WhatsApp message points to it (the original message stays readable from the request)
alter table public.quotation_requests add column if not exists whatsapp_import_id uuid references public.whatsapp_imports(id) on delete set null;
alter table public.quotation_requests add column if not exists source text not null default 'form';

-- the "Football / JDT" category on quotation requests too
alter table public.quotation_requests drop constraint if exists quotation_requests_event_type_check;
alter table public.quotation_requests add constraint quotation_requests_event_type_check check (event_type = any (array[
  'aidilfitri_gathering','annual_dinner','appreciation_dinner','award_ceremony','birthday_party','business_dinner','business_luncheon',
  'charity_event','community_event','company_anniversary','conference','corporate_event','corporate_meeting','cultural_celebration',
  'customer_appreciation_event','engagement_ceremony','exhibition','family_day','farewell_party','football_jdt','fundraising_event','gala_dinner',
  'government_event','graduation_ceremony','grand_opening','housewarming','majlis_akikah','majlis_berkhatan','majlis_doa_selamat',
  'majlis_kesyukuran','majlis_perkahwinan','majlis_pertunangan','official_ceremony','open_house','press_conference','product_launch',
  'ramadan_iftar','religious_gathering','retirement_party','roadshow','school_event','seminar','sports_event','staff_appreciation_event',
  'team_building','training','university_event','vip_reception','wedding_reception','workshop','other','wedding','corporate','birthday','funeral'
]::text[]));
