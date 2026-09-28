create policy "documents_bucket_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.user_has_company_access(((storage.foldername(name))[1])::uuid)
  );
