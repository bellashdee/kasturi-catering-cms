-- Every uploaded file is converted to Markdown with MarkItDown right after upload; the result is kept with the document.
-- Additive columns only. Existing rows start as "pending" and are converted by the backfill.
alter table documents
  add column markdown_text text,
  add column markdown_status text not null default 'pending'
    check (markdown_status in ('pending', 'done', 'skipped', 'failed')),
  add column markdown_note text,
  add column markdown_at timestamptz;
