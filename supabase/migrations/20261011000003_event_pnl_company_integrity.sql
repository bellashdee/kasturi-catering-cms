-- An event P&L entry must belong to the same company as its event (and a linked invoice must too), so a revenue or cost
-- can never be filed under the wrong company, whatever client wrote it.
create or replace function event_pnl_entry_company_check() returns trigger language plpgsql as $$
declare event_company uuid;
begin
  select company_id into event_company from catering_events where id = new.catering_event_id;
  if event_company is null or event_company <> new.company_id then
    raise exception 'The entry company does not match the event company.';
  end if;
  return new;
end $$;

create trigger event_revenue_entries_company_check before insert or update on event_revenue_entries
  for each row execute function event_pnl_entry_company_check();
create trigger event_cost_entries_company_check before insert or update on event_cost_entries
  for each row execute function event_pnl_entry_company_check();
create trigger event_budgets_company_check before insert or update on event_budgets
  for each row execute function event_pnl_entry_company_check();
