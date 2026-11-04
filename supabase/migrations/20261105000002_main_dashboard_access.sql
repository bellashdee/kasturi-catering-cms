-- The Main Dashboard (the company figures) is for the bosses and the staff whose job needs it, not for everybody.
-- A Super Admin always sees it; for everybody else a Super Admin switches it on in Settings -> Team Members.
alter table public.profiles add column if not exists can_view_main_dashboard boolean not null default false;

update public.profiles set can_view_main_dashboard = true
where lower(email) in (
  'penny@kasturicatering.com.my',   -- Madam Penny
  'faidzrashid@gmail.com',          -- Mr. Faidz
  'ismaizal@kasturicatering.com.my',-- Mr. Ismaizal
  'atiqufarhan@gmail.com',          -- Mr. Atiq
  'nabilahshidee@gmail.com',        -- Ms. Nabilah
  'nabilahshdee@gmail.com',
  'k.adlansa@gmail.com'             -- Mr. Adlan
);
