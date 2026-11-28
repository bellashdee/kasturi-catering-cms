-- Settings → Team Members: every module now lists all its sub-categories. Some pages that used to ride on another sub-category got their own
-- key (Wastage, SOA Statements & ageing, SOA Reconciliation, Probation Tracker) and some pages that were open to every member of a module
-- are now tickable (Payroll Centre, Company Spending: Company Expenses / Budgets). A member who was limited to some sub-categories keeps
-- exactly what they could open before: the new keys are added to their list. Members with no list (full access) are not touched.

-- snapshot first (kept in the database)
create table if not exists public.user_company_access_sections_snapshot_20261128 as
  select id, user_id, company_id, allowed_modules, allowed_sections, now() as taken_at
  from public.user_company_access
  where allowed_sections is not null and cardinality(allowed_sections) > 0;
alter table public.user_company_access_sections_snapshot_20261128 enable row level security;

create or replace function pg_temp.add_keys(cur text[], extra text[]) returns text[] language sql immutable as $$
  select array(select distinct k from unnest(cur || extra) k order by k)
$$;

-- Wastage was part of Stock
update public.user_company_access set allowed_sections = pg_temp.add_keys(allowed_sections, array['kitchen:wastage'])
  where 'kitchen:stock' = any(allowed_sections) and not 'kitchen:wastage' = any(allowed_sections);

-- the three SOA pages were one sub-category
update public.user_company_access set allowed_sections = pg_temp.add_keys(allowed_sections, array['supplier-procurement:soa-statements', 'supplier-procurement:soa-reconcile'])
  where 'supplier-procurement:soa' = any(allowed_sections);

-- the Probation Tracker was part of the Employee Database
update public.user_company_access set allowed_sections = pg_temp.add_keys(allowed_sections, array['hr:probation'])
  where 'hr:database' = any(allowed_sections) and not 'hr:probation' = any(allowed_sections);

-- the Payroll Centre was open to every HR member (its figures still need the payroll access)
update public.user_company_access set allowed_sections = pg_temp.add_keys(allowed_sections, array['hr:payroll-centre'])
  where exists (select 1 from unnest(allowed_sections) k where k like 'hr:%') and not 'hr:payroll-centre' = any(allowed_sections);

-- Company Expenses and Budgets were open to every Admin & Finance member
update public.user_company_access set allowed_sections = pg_temp.add_keys(allowed_sections, array['finance-admin:company-expenses', 'finance-admin:budgets'])
  where exists (select 1 from unnest(allowed_sections) k where k like 'finance-admin:%');
