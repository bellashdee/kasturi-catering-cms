-- Staff files: warning letters, confirmation letters, offer letters and other HR papers of one staff member, kept as soft copies.
-- Only the Super Admins (Madam Penny and Nabilah) and the staff member the file belongs to can see, view or download a file:
-- the rule is in the database (table and storage), not only in the screens, so no other user can reach it by any route.

insert into storage.buckets (id, name, public) values ('staff-files', 'staff-files', false) on conflict (id) do nothing;

create table public.employee_files (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('warning_letter', 'confirmation_letter', 'offer_letter', 'probation_extension_letter', 'personal_information', 'other')),
  title text not null,
  issued_date date,
  storage_path text not null unique,
  original_filename text not null,
  content_type text,
  file_size bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index employee_files_employee_idx on public.employee_files(employee_id, created_at);

alter table public.employee_files enable row level security;

create policy employee_files_select on public.employee_files for select to authenticated
  using (public.current_user_is_super_admin() or public.user_owns_employee(employee_id));
create policy employee_files_insert on public.employee_files for insert to authenticated with check (public.current_user_is_super_admin());
create policy employee_files_update on public.employee_files for update to authenticated using (public.current_user_is_super_admin()) with check (public.current_user_is_super_admin());
create policy employee_files_delete on public.employee_files for delete to authenticated using (public.current_user_is_super_admin());

revoke all on public.employee_files from anon;

-- the files themselves: the first folder of a path is the staff record id
create policy staff_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'staff-files'
    and (
      public.current_user_is_super_admin()
      or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.user_owns_employee(((storage.foldername(name))[1])::uuid))
    )
  );
create policy staff_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'staff-files' and public.current_user_is_super_admin());
create policy staff_files_update on storage.objects for update to authenticated using (bucket_id = 'staff-files' and public.current_user_is_super_admin()) with check (bucket_id = 'staff-files' and public.current_user_is_super_admin());
create policy staff_files_delete on storage.objects for delete to authenticated using (bucket_id = 'staff-files' and public.current_user_is_super_admin());

-- a probation letter that is issued is kept as a staff file (private), not in the shared documents bucket
alter table public.employee_probation_events add column if not exists issued_file_id uuid references public.employee_files(id) on delete set null;
