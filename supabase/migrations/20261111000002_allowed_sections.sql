-- Settings: a member can be given only some sub-categories (tabs) of a module, for example only Recipes and Stock of Kitchen.
-- null = no limit (every section of every module the member has), so nothing changes for anyone until a Super Admin limits a member.
alter table public.user_company_access add column if not exists allowed_sections text[];
