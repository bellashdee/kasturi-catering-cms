-- Date-only events (JDT match dates): the date is confirmed before the menu and pax are known.
-- Three statuses are added before "confirmed"; nothing is removed or renamed, so every existing event keeps its status.
--   date_confirmed     the date is confirmed, menu and pax pending
--   details_pending    waiting for the menu and pax
--   ready_for_planning the menu and pax are in; kitchen / purchasing may plan (money reports wait for "confirmed")
alter type public.event_status add value if not exists 'date_confirmed' before 'confirmed';
alter type public.event_status add value if not exists 'details_pending' before 'confirmed';
alter type public.event_status add value if not exists 'ready_for_planning' before 'confirmed';

-- The "Football / JDT" event category.
alter table public.catering_events drop constraint if exists catering_events_event_type_check;
alter table public.catering_events add constraint catering_events_event_type_check check (event_type = any (array[
  'aidilfitri_gathering','annual_dinner','appreciation_dinner','award_ceremony','birthday_party','business_dinner','business_luncheon',
  'charity_event','community_event','company_anniversary','conference','corporate_event','corporate_meeting','cultural_celebration',
  'customer_appreciation_event','engagement_ceremony','exhibition','family_day','farewell_party','football_jdt','fundraising_event','gala_dinner',
  'government_event','graduation_ceremony','grand_opening','housewarming','majlis_akikah','majlis_berkhatan','majlis_doa_selamat',
  'majlis_kesyukuran','majlis_perkahwinan','majlis_pertunangan','official_ceremony','open_house','press_conference','product_launch',
  'ramadan_iftar','religious_gathering','retirement_party','roadshow','school_event','seminar','sports_event','staff_appreciation_event',
  'team_building','training','university_event','vip_reception','wedding_reception','workshop','other','wedding','corporate','birthday','funeral'
]::text[]));
