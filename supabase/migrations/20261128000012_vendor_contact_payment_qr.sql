-- Vendor Contacts: the vendor's payment QR (DuitNow QR / bank QR), a photo kept in the documents bucket, for paying by scanning it.
alter table public.vendor_contacts
  add column if not exists payment_qr_document_id uuid references public.documents (id) on delete set null;
