-- Data (already applied on 27/11/2026): the 12 JDT December 2026 matches added earlier that day become date-only events
-- (Date Confirmed, category Football / JDT). A copy of the rows as they were is kept in backup_20261127_jdt_events (RLS on, no policies).
-- Guarded by the old name pattern, so running it again changes nothing.
create table if not exists public.backup_20261127_jdt_events as
  select * from public.catering_events
  where customer_id = 'a30a2abd-0607-4fc9-966d-a7be7b3c43aa' and event_date between '2026-12-01' and '2026-12-31';
alter table public.backup_20261127_jdt_events enable row level security;

with src as (
  select id,
    substring(event_name from '\(AWAY · INFO ONLY: (.*)\)$') as away_match,
    substring(event_name from '^JDT FC SDN BHD \((.*)\)$') as home_match,
    substring(remarks from '(?:HOME|AWAY) (.*?) match') as comp
  from public.catering_events
  where customer_id = 'a30a2abd-0607-4fc9-966d-a7be7b3c43aa' and event_date between '2026-12-01' and '2026-12-31'
    and event_name like 'JDT FC SDN BHD (%'
)
update public.catering_events e set
  status = 'date_confirmed',
  event_type = 'football_jdt',
  event_name = case when s.away_match is not null then 'JDT Match – AWAY: ' || s.away_match || ' (no catering)' else 'JDT Match – ' || s.home_match || ' (' || s.comp || ')' end,
  remarks = case when s.away_match is not null then 'Away match (' || s.comp || '), for information only: no catering. From the JDT December 2026 match calendar.'
            else 'Home match (' || s.comp || '). Menu and pax pending from JDT. From the JDT December 2026 match calendar.' end
from src s where s.id = e.id;
