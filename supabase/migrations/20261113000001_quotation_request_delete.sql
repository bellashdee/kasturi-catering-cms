-- The Quotation Request Inbox people (Ms. Nabilah, Mr. Adlan, Ms. Penny) can delete a request: its notes, history and file rows go with it
-- (on delete cascade), and they can remove its attachments from the private bucket.

create policy quotation_requests_delete on public.quotation_requests
  for delete to authenticated
  using (public.user_has_quotation_request_access());

create policy quotation_request_files_remove on storage.objects
  for delete to authenticated
  using (bucket_id = 'quotation-request-files' and public.user_has_quotation_request_access());
