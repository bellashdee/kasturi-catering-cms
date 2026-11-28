-- JDT FC SDN BHD is a direct company job of Signature Solution: no sales agent, no PIC, no commission, paid in cash.
-- Mr. Ismaizal only forwards the chats of JDT's management; he does not handle JDT (Ms. Nabilah, 28 Nov 2026).
-- The Signature Solution quotation form used to fill in "Mr. Ismaizal" by itself; the two JDT requests it saved get "Direct (no agent)" instead (sales_agent cannot be empty).
-- Applied to production on 28 Nov 2026. Before: both rows had sales_agent = 'Mr. Ismaizal'.
--   7b84c47d-3745-408d-bc46-b8c425112394  (JDT FC SDN. BHD.)
--   04336da3-3e44-4c3b-aeef-420da151f31b  (JDT FC SDN BHD)
-- Rollback: update public.quotation_requests set sales_agent = 'Mr. Ismaizal' where id in ('7b84c47d-3745-408d-bc46-b8c425112394', '04336da3-3e44-4c3b-aeef-420da151f31b');
update public.quotation_requests
set sales_agent = 'Direct (no agent)'
where id in ('7b84c47d-3745-408d-bc46-b8c425112394', '04336da3-3e44-4c3b-aeef-420da151f31b')
  and sales_agent = 'Mr. Ismaizal';
