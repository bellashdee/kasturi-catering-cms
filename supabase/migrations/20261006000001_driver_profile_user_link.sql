-- Links a driver record to the login account that is allowed to clock in/out as that driver.
alter table driver_profiles add column user_id uuid references profiles(id) on delete set null;

-- One account can be linked to at most one driver record per company.
create unique index driver_profiles_company_user_key on driver_profiles(company_id, user_id) where user_id is not null;
