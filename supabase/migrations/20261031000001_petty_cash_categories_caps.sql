-- The petty cash categories are now in capitals and follow the Company Expenses names (AYAM, GROCERIES, BAKERY ...). The saved
-- petty cash records (cash book and staff claims) get the new names; a record with more than one category keeps them all, in order.
create or replace function pg_temp.petty_cash_category_caps(old_text text) returns text language sql immutable as $$
  select string_agg(
    case trim(part)
      when 'Bakery & bread' then 'BAKERY'
      when 'Cleaning supplies' then 'CLEANING SUPPLIES'
      when 'Decoration & event setup' then 'DECORATION & EVENT SETUP'
      when 'Disposables & packaging' then 'EQUIPMENT / PACKAGING'
      when 'Dry goods & groceries' then 'GROCERIES'
      when 'Equipment rental' then 'EQUIPMENT RENTAL'
      when 'Fresh ingredients (market)' then 'FRESH MARKET'
      when 'Fuel' then 'FUEL'
      when 'Gas (LPG)' then 'GAS'
      when 'Ice & beverages' then 'ICE & BEVERAGES'
      when 'Lalamove' then 'LALAMOVE'
      when 'Meals' then 'STAFF MEALS'
      when 'Parking' then 'TOLL & PARKING'
      when 'Part-time worker wages' then 'PART-TIME WORKER WAGES'
      when 'Repairs & tools' then 'REPAIRS & MAINTENANCE'
      when 'Stationery & printing' then 'STATIONERY & PRINTING'
      when 'Toll' then 'TOLL & PARKING'
      when 'Transport & lorry hire' then 'TRANSPORTATION / DELIVERY'
      when 'Uniforms & safety gear' then 'UNIFORMS & SAFETY GEAR'
      else upper(trim(part))
    end, ', ' order by ord)
  from unnest(string_to_array(old_text, ',')) with ordinality as u(part, ord)
  where trim(part) <> ''
$$;

update public.operation_petty_cash
set category = pg_temp.petty_cash_category_caps(category)
where category is not null and category is distinct from pg_temp.petty_cash_category_caps(category);

update public.petty_cash_transactions
set category = pg_temp.petty_cash_category_caps(category)
where category is not null and category is distinct from pg_temp.petty_cash_category_caps(category);
