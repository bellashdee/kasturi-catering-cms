import { KIND_PROMPTS } from "./kindPrompts";

export const DOCUMENT_TYPES = [
  "supplier_invoice",
  "customer_invoice",
  "quotation",
  "delivery_order",
  "payment_voucher",
  "receipt",
  "bank_payment_proof",
  "purchase_order",
  "event_order_beo",
  "monthly_costing",
  "petty_cash_claim",
  "rental_or_utility_bill",
  "hr_document",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  supplier_invoice: "Supplier invoice",
  customer_invoice: "Customer invoice",
  quotation: "Quotation",
  delivery_order: "Delivery order",
  payment_voucher: "Payment voucher",
  receipt: "Receipt",
  bank_payment_proof: "Bank payment proof",
  purchase_order: "Purchase order",
  event_order_beo: "Event order (BEO)",
  monthly_costing: "Monthly costing",
  petty_cash_claim: "Petty cash claim",
  rental_or_utility_bill: "Rental or utility bill",
  hr_document: "HR document",
  other: "Other / unrecognised",
};

/** The document types each module's form makes sense for. A different detected type produces a warning, never a block. */
export const EXPECTED_TYPES: Record<string, DocumentType[]> = {
  supplier_invoice: ["supplier_invoice", "receipt", "delivery_order"],
  purchase_receipt: ["supplier_invoice", "receipt", "delivery_order"],
  customer_invoice: ["customer_invoice"],
  customer_event_invoice: ["customer_invoice", "event_order_beo", "quotation", "delivery_order"],
  finance_payment: ["supplier_invoice", "rental_or_utility_bill", "payment_voucher", "bank_payment_proof", "receipt"],
  company_expense: ["receipt", "supplier_invoice", "rental_or_utility_bill", "bank_payment_proof"],
  marketing_expense: ["receipt", "supplier_invoice", "bank_payment_proof"],
  driver_expense_receipt: ["receipt", "supplier_invoice"],
  vehicle_service_receipt: ["receipt", "supplier_invoice"],
  employee_certificate: ["hr_document"],
  company_document: ["hr_document", "other"],
};

/** General-purpose reader: identify the document first, then fill only the fields that document type has. */
export const AUTO_PROMPT = `You are reading a business document for a catering company (Malaysia). First work out what type of document it is, then extract only the fields that document type actually has. Respond with ONLY a JSON object, no other text:
{
  "company_name": the company the document is addressed to / billed to / paid by, as printed, else null,
  "issuer_name": the company or person that issued the document (supplier, landlord, utility provider, bank), else null,
  "counterparty_name": the supplier, customer or payee this document is about, as printed, else null,
  "document_number": the invoice / voucher / receipt / order / reference number as printed, else null,
  "document_date": date as printed converted to ISO (YYYY-MM-DD), else null,
  "due_date": ISO date (YYYY-MM-DD) the payment is due, else null,
  "description": a short description of what the document is for, else null,
  "currency": the currency code or symbol as printed (e.g. "RM", "MYR"), else null,
  "items": [
    { "description": "as printed", "quantity": a plain number or null, "unit": "as printed" or null, "unit_price": a plain number or null, "line_total": the amount printed for that line or null }
  ],
  "subtotal": the subtotal before tax as printed, else null,
  "tax_amount": the tax / SST / service charge amount as printed, else null,
  "total_amount": the total / amount payable / amount transferred as printed, else null,
  "payment_status_evidence": the exact printed words that show the document is paid / unpaid / successful (for example "Status: Successful" or "PAID"), else null,
  "payment_reference": the payment / transfer / cheque reference as printed, else null,
  "payment_date": ISO date (YYYY-MM-DD) the payment was made, if printed, else null,
  "bank_name": a bank name only if printed on the document, else null,
  "bank_account_no": a bank account number only if printed, exactly as printed, else null
}
Only fill a field if this document type really has it. Do not say a document is paid merely because a voucher or invoice exists; use payment_status_evidence only for words actually printed.`;

/** Appended to every prompt: asks for the structured wrapper that carries source page, confidence and review notes. */
export function wrapperInstructions(context: string): string {
  return `

=== OUTPUT FORMAT (this overrides "respond with ONLY a JSON object" above — the schema above now goes inside "data") ===
${context}
Return ONE JSON object with exactly these keys:
{
  "document_type": one of ${DOCUMENT_TYPES.map((t) => `"${t}"`).join(" | ")},
  "legibility": "good" | "partial" | "poor",
  "data": { ...the object described above, same keys, same types... },
  "field_meta": {
    "<each non-array key of data>": { "status": "found" | "absent" | "unreadable", "page": <1-based page number, or the sheet name for a spreadsheet, or null>, "confidence": "high" | "medium" | "low", "label": <the label printed next to the value on the document, e.g. "Recipient Reference"; null if there is none>, "printed": <the value exactly as it appears on the document, e.g. "RM 2,230.00" or "01/08/2026" or "5510 1672 4784"; null if absent>, "note": <short string or null> }
  },
  "pages_read": [ { "page": <1-based page number, or the sheet name for a spreadsheet>, "content": "<what is on this page/sheet in under 12 words, or \"blank\">" } ],
  "totals": { "subtotal": number | null, "tax": number | null, "total": number | null, "currency": string | null },
  "issues": [ "<one short sentence per problem: blurry, cut off, upside-down, handwritten, ambiguous, covered, or any line/field you skipped — name the page>" ]
}
Rules:
- "absent" = the document simply does not contain that field (value null). "unreadable" = it is there but you cannot read it reliably (value null; explain in note). Never guess a number, date, name or account number; never complete a partly visible number.
- Never calculate or infer a value: a due date worked out from payment terms ("Net 30 days", "7 days before the event"), a total worked out from lines, or a tax rate are NOT printed values, so they are absent (null). Fill a field only with what is actually printed.
- Keep every number exactly as printed (decimals, no rounding). Do not convert currencies.
- Pages may be rotated or upside down: read them anyway. Read EVERY page, and list EVERY page (every sheet for a spreadsheet) in "pages_read" — a page you skip must still appear there with what you could see.
- For every object inside an "items" array also include "page" (page number where that line appears) and "line_total" (the amount printed for that line, else null). If you leave a line out because it is unclear, add an entry to "issues" naming the page.
- "totals" are the subtotal / tax / total exactly as printed on the document (null when not printed). Do not calculate them yourself.
- Do not state or assume a payment status unless the document prints evidence of it.
- If you cannot read the document at all, return data with all values null, legibility "poor", and explain in "issues".`;
}

export function basePromptFor(kind: string): string {
  if (kind === "auto") return AUTO_PROMPT;
  return KIND_PROMPTS[kind] ?? KIND_PROMPTS.employee_certificate;
}
