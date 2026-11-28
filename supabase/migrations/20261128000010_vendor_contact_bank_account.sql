-- Vendor Contacts: the vendor's bank account, for paying the vendor by bank transfer (Supplier & Procurement → Vendor Contacts).
-- Kept as typed (nothing is checked against the bank). Same access as the rest of the vendor row (vendor_contacts_all policy).
alter table public.vendor_contacts
  add column if not exists bank_name text,
  add column if not exists bank_account_no text,
  add column if not exists bank_account_holder text;
