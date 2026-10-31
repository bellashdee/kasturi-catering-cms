-- One list of spending categories for Petty Cash, My Claims and Company Expenses (in capitals, alphabetical; see
-- src/lib/finance/spendingCategories.ts). The saved records get the new names; a petty cash record with more than one category keeps
-- them all, now kept apart with " | " (some names have a comma in them). The kind of seafood (CENGKERANG, KETAM ...) moves to the notes.
create or replace function pg_temp.new_category(old_name text) returns text language sql immutable as $$
  select case upper(regexp_replace(trim(old_name), '\s+', ' ', 'g'))
    when 'AYAM' then 'CHICKEN'
    when 'DAGING' then 'BEEF & MEAT'
    when 'IKAN' then 'FISH'
    when 'EGG' then 'EGGS'
    when 'SAYUR' then 'VEGETABLES'
    when 'BUAH' then 'FRUITS'
    when 'BERAS' then 'RICE'
    when 'GROCERIES' then 'DRY GOODS & GROCERIES'
    when 'DRY GOODS & GROCERIES' then 'DRY GOODS & GROCERIES'
    when 'FROZEN' then 'DAIRY & FROZEN PRODUCTS'
    when 'PASTE' then 'FOOD PASTE, SAUCES & SEASONINGS'
    when 'BAKERY' then 'BAKERY & BREAD'
    when 'BAKERY & BREAD' then 'BAKERY & BREAD'
    when 'KUIH' then 'BAKERY & BREAD'
    when 'ATLAS ICE' then 'ICE'
    when 'ICE & BEVERAGES' then 'ICE'
    when 'GAS' then 'CHARCOAL & GAS'
    when 'GAS (LPG)' then 'CHARCOAL & GAS'
    when 'EQUIPMENT / PACKAGING' then 'PACKAGING & DISPOSABLE ITEMS'
    when 'DISPOSABLES & PACKAGING' then 'PACKAGING & DISPOSABLE ITEMS'
    when 'CLEANING / PACKAGING / EQUIPMENT' then 'CLEANING & SANITATION SUPPLIES'
    when 'CLEANING SUPPLIES' then 'CLEANING & SANITATION SUPPLIES'
    when 'TRANSPORTATION / DELIVERY' then 'TRANSPORTATION & DELIVERY'
    when 'TRANSPORT & LORRY HIRE' then 'TRANSPORTATION & DELIVERY'
    when 'LALAMOVE' then 'TRANSPORTATION & DELIVERY'
    when 'FRESH INGREDIENTS (MARKET)' then 'VEGETABLES'
    when 'FRESH MARKET' then 'VEGETABLES'
    when 'PART-TIME WORKER WAGES' then 'STAFF SALARIES & WAGES'
    when 'REPAIRS & TOOLS' then 'EQUIPMENT, KITCHEN SUPPLIES & MAINTENANCE'
    when 'REPAIRS & MAINTENANCE' then 'EQUIPMENT, KITCHEN SUPPLIES & MAINTENANCE'
    when 'DECORATION & EVENT SETUP' then 'MISCELLANEOUS'
    when 'FUEL' then 'FUEL / PETROL'
    when 'MEALS' then 'STAFF MEALS & REFRESHMENTS'
    when 'UNIFORMS & SAFETY GEAR' then 'STAFF UNIFORMS & PPE'
    when 'OTHER' then 'MISCELLANEOUS'
    else case when upper(trim(old_name)) like 'SEAFOOD%' then 'SEAFOOD' else upper(regexp_replace(trim(old_name), '\s+', ' ', 'g')) end
  end
$$;

-- a petty cash category text (older ones: several names with a comma) in the new names, kept apart with " | "
create or replace function pg_temp.new_categories(old_text text) returns text language sql immutable as $$
  select string_agg(distinct_name, ' | ' order by first_ord) from (
    select pg_temp.new_category(part) as distinct_name, min(ord) as first_ord
    from unnest(string_to_array(old_text, ',')) with ordinality as u(part, ord)
    where trim(part) <> ''
    group by 1
  ) parts
$$;

-- the kind of seafood is kept in the notes before the category becomes SEAFOOD
update public.expenses
set notes = trim(regexp_replace(category, '^\s*SEAFOOD\s*-\s*', '', 'i')) || coalesce(' · ' || nullif(trim(notes), ''), '')
where upper(trim(category)) like 'SEAFOOD -%';

update public.expenses set category = pg_temp.new_category(category) where category is distinct from pg_temp.new_category(category);
update public.budgets set category = pg_temp.new_category(category) where category is distinct from pg_temp.new_category(category);
update public.operation_petty_cash set category = pg_temp.new_categories(category) where category is not null and category is distinct from pg_temp.new_categories(category);
update public.petty_cash_transactions set category = pg_temp.new_categories(category) where category is not null and category is distinct from pg_temp.new_categories(category);


-- the category choices of the forms, budgets and report filters come from that same list in the code (not cost_categories)
