-- Data change (18 Nov 2026): supplier invoices have no review / approval step any more, so the 108 invoices that were still
-- "pending_review" (RM 65,751.39, keyed in 14 Oct - 16 Nov 2026) are now "issued", the same as every other keyed-in invoice.
-- A snapshot of those invoices and their old status was saved before the change
-- (snapshot-supplier-invoices-pending-review-2026-11-18.csv in the session notes). To undo, set those ids back to 'pending_review'.
update public.supplier_invoices set status = 'issued' where status = 'pending_review';
