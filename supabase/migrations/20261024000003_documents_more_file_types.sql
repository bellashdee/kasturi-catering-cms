-- The AI Assistant reads any file a person attaches (Word, PowerPoint, text and others besides the existing PDF / Excel / CSV / photo / screenshot).
alter table public.documents drop constraint if exists documents_file_type_check;
alter table public.documents
  add constraint documents_file_type_check
  check (file_type in ('pdf', 'excel', 'csv', 'photo', 'screenshot', 'word', 'powerpoint', 'text', 'other'));
