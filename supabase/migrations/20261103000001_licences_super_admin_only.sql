-- Licences & Documents (company_documents): only the Super Admins (Madam Penny and Nabilah) may read or change them.
-- The pages already hid them from everybody else; this makes the database refuse the rows too, whatever way they are asked for.
create policy company_documents_super_admin_only on public.company_documents as restrictive for all to authenticated
  using (public.current_user_is_super_admin()) with check (public.current_user_is_super_admin());
