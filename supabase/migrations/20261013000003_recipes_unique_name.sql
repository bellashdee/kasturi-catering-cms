-- The same recipe name cannot be saved twice for one company (case-insensitive). Existing duplicates were merged first.
create unique index recipes_company_name_key on recipes (company_id, lower(btrim(name)));
