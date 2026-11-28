import { LINE_CATEGORIES } from "./schema";

/**
 * What the AI reader is asked to fill for a supplier invoice. The wrapper added by the extraction pipeline asks, for every
 * field, the printed text, the page / cell it came from and a confidence, and forbids guessing or calculating.
 */
export const AI_INVOICE_PROMPT = `You are reading a supplier invoice / bill / cash bill / tax invoice received by a Malaysian catering company (Kasturi Indah, Signature Solution or O2 Life). The document may be in English, Bahasa Melayu or Chinese. Respond with ONLY a JSON object, no other text:
{
  "supplier_name": the supplier / seller's name exactly as printed (the company that issued the invoice), else null,
  "supplier_registration_no": the supplier's company registration number (SSM / ROC / BRN, e.g. "202001012345 (1234567-X)") exactly as printed, else null,
  "supplier_tax_no": the supplier's SST registration no. or TIN exactly as printed, else null,
  "bill_to_name": the customer the invoice is billed to (Bill To / Sold To / Customer / Kepada) exactly as printed, else null,
  "invoice_number": the invoice / bill / cash bill number exactly as printed, else null,
  "invoice_date": the invoice date converted to ISO (YYYY-MM-DD), else null,
  "due_date": the due date as printed, converted to ISO (YYYY-MM-DD), else null,
  "po_number": the customer's purchase order number (PO No. / P.O. / Your Order No.) exactly as printed, else null,
  "do_number": the delivery order number (DO No.) exactly as printed, else null,
  "event_reference": an event name, event date or event / job reference printed on the invoice (for example "Majlis Perkahwinan 12/10", "JOB 123"), else null,
  "description": the invoice's own description / remarks line if it has one, else null,
  "currency": the currency as printed ("RM", "MYR", "SGD"...), else null,
  "payment_terms": the payment terms exactly as printed ("30 DAYS", "C.O.D", "Cash"), else null,
  "items": [
    { "item_code": the item / product code printed on the line, else null,
      "description": the line description EXACTLY as printed (same spelling, capitals, abbreviations, sizes and brackets; never correct, translate, shorten or reword it),
      "category": the best fitting category for this line from ${LINE_CATEGORIES.map((c) => `"${c}"`).join(", ")} (this one is your suggestion, it is not printed),
      "quantity": the quantity exactly as printed (keep every decimal), else null,
      "unit": the unit of measure exactly as printed ("KG", "PKT", "CTN", "EA"), else null,
      "unit_price": the unit price exactly as printed, else null,
      "discount": the discount printed for that line, else null,
      "tax_amount": the tax / SST printed for that line, else null,
      "line_total": the amount printed for that line, else null }
  ],
  "subtotal": the subtotal printed before tax / charges, else null,
  "discount_total": a discount printed for the whole invoice, else null,
  "tax_amount": the SST / service tax / GST amount printed, else null,
  "delivery_charge": a delivery / transport charge printed separately from the item lines, else null,
  "other_charges": any other charge printed separately (handling, service charge...), else null,
  "rounding": the rounding adjustment printed, else null,
  "total_amount": the grand total / total payable printed, else null,
  "amount_paid": an amount printed as already paid / deposit received, else null,
  "outstanding_amount": a balance / amount due printed after payments, else null,
  "is_chat_screenshot": true if the image is a screenshot of a chat app (WhatsApp, Telegram, WeChat, SMS), else false,
  "chat_text": on a chat screenshot, the text of the chat messages themselves (not the invoice), else null
}
Rules for this document:
- Copy every item line in the order printed, one entry per printed line, across every page (never merge, split, skip, sort or rename lines). A delivery / transport charge printed as an item line stays an item line.
- Never round, convert, recalculate or complete a figure. A total that is not printed is null even if the lines add up to something.
- A chat screenshot: take values ONLY from the invoice / bill shown in it (an attached photo, a PDF preview or a typed invoice). Numbers typed in chat bubbles ("total 350", "dah bayar 200") are NOT invoice values: never use them for any field. If the only place a total appears is a chat message, leave total_amount null and say so in "issues".
- Handwritten invoices: read them, but give confidence "low" to any figure that is not clearly legible.
- If several invoices are in the one file, read the first one and say in "issues" that the file contains more than one invoice.`;
