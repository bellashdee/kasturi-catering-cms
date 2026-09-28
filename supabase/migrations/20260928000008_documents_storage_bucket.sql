insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_bucket_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and public.user_has_company_access(((storage.foldername(name))[1])::uuid)
  );

create policy "documents_bucket_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.user_has_company_access(((storage.foldername(name))[1])::uuid)
  );
