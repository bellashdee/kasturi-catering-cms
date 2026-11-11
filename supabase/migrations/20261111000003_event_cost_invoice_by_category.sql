-- A supplier invoice can now be recorded as several costs of an event, one per category (its items grouped by category).
-- It still belongs to one event only, and each category of it is counted once.

drop index if exists event_cost_entries_supplier_invoice_key;
create unique index event_cost_entries_supplier_invoice_type_key on event_cost_entries (supplier_invoice_id, cost_type) where supplier_invoice_id is not null;

create or replace function event_cost_invoice_one_event() returns trigger
language plpgsql as $$
begin
  if new.supplier_invoice_id is not null and exists (
    select 1 from event_cost_entries
    where supplier_invoice_id = new.supplier_invoice_id and catering_event_id <> new.catering_event_id and id <> new.id
  ) then
    raise exception 'This supplier invoice is already the cost of another event.';
  end if;
  return new;
end $$;

create trigger event_cost_invoice_one_event
  before insert or update of supplier_invoice_id, catering_event_id on event_cost_entries
  for each row execute function event_cost_invoice_one_event();
