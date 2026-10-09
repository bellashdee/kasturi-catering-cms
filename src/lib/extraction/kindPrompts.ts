// The per-module field schemas the extractor is asked to fill. Each module keeps reading the same flat JSON it always did.
export const KIND_PROMPTS: Record<string, string> = {
  employee_certificate: `You are reading a staff document: a food handling certificate, typhoid certificate, work permit, training certificate, medical certificate (MC), confirmation letter, or letter of appointment/offer (LOA). Extract the following fields from the image/document and respond with ONLY a JSON object, no other text:
{
  "cert_type": one of "food_handling" | "typhoid" | "work_permit" | "training" | "medical_certificate" | "confirmation_letter" | "loa" | "other",
  "cert_name": the document's title as printed,
  "cert_number": the certificate/reference number if visible, else null,
  "issued_date": ISO date (YYYY-MM-DD) if visible (for an MC use its first day of leave), else null,
  "expiry_date": ISO date (YYYY-MM-DD) if visible (for an MC use its last day of leave; confirmation letters and LOAs have none), else null,
  "holder_name": the person's name as printed, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  company_document: `You are reading a company licence or agreement: an MBJB (Majlis Bandaraya Johor Bahru) business licence, a Halal certificate/licence, a tenancy agreement, or a similar document. Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "doc_type": one of "mbjb_licence" | "halal_licence" | "tenancy_agreement" | "other",
  "title": the document's title or the premises/business it covers, as printed,
  "reference_number": the licence/certificate/agreement number if visible, else null,
  "issued_date": ISO date (YYYY-MM-DD) the licence starts or the agreement is dated, if visible, else null,
  "expiry_date": ISO date (YYYY-MM-DD) the licence expires or the tenancy ends, if visible, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  marketing_expense: `You are reading a receipt or invoice for a marketing expense (ad spend, printing, event cost, influencer payment, etc). Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "category": one of "advertising" | "print" | "event" | "influencer" | "content_production" | "other",
  "description": a short description of what this expense was for (e.g. vendor name + item),
  "amount": the total amount as a plain number (no currency symbol), else null,
  "expense_date": ISO date (YYYY-MM-DD) if visible, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  campaign_performance: `You are reading a screenshot of social media or ad platform analytics (e.g. Instagram Insights, Facebook Ads Manager, Google Ads). Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "report_date": ISO date (YYYY-MM-DD) the data is for, if visible, else null,
  "impressions": total impressions/reach as a plain integer, else null,
  "clicks": total clicks/link clicks as a plain integer, else null,
  "leads_generated": total leads/enquiries as a plain integer, else null,
  "conversions": total conversions/results as a plain integer, else null,
  "spend": amount spent as a plain number (no currency symbol), else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  stock_count: `You are reading a photo or screenshot of a kitchen stock count (a shelf, a stock sheet, or a handwritten count list). Extract every ingredient and its counted quantity and respond with ONLY a JSON object, no other text:
{
  "items": [
    { "ingredient_name": "as written or best guess", "quantity": a plain number, "unit": "kg" | "g" | "l" | "ml" | "pcs" | "pack" | "other" | null }
  ]
}
List every distinct item you can identify. If a quantity is not legible, omit that item rather than guessing.`,
  customer_event_invoice: `You are reading an invoice or order sheet issued to a customer for a catering event. Stock will be deducted for what was supplied, so list every line item (a food item, dish, ingredient or supply, whatever is written) with its quantity. Respond with ONLY a JSON object, no other text:
{
  "customer_name": the customer's name as printed, else null,
  "event_name": the event name or description if shown, else null,
  "invoice_number": the invoice number as printed, else null,
  "invoice_date": ISO date (YYYY-MM-DD) if visible, else null,
  "items": [
    { "ingredient_name": "the item exactly as written", "quantity": a plain number, "unit": "kg" | "g" | "l" | "ml" | "pcs" | "pack" | "other" | null }
  ]
}
List every distinct line item. If a quantity is not legible, omit that item rather than guessing.`,
  purchase_receipt: `You are reading a supplier invoice, delivery order or purchase receipt for kitchen ingredients. Extract every line item and respond with ONLY a JSON object, no other text:
{
  "supplier_name": the supplier's name as printed, else null,
  "invoice_number": the invoice or delivery order number as printed, else null,
  "receipt_date": ISO date (YYYY-MM-DD) if visible, else null,
  "items": [
    { "ingredient_name": "as written on the receipt", "quantity": a plain number, "unit": "kg" | "g" | "l" | "ml" | "pcs" | "pack" | "other" | null, "unit_price": a plain number if visible, else null }
  ]
}
List every distinct line item. If a quantity or price is not legible, omit that field rather than guessing.`,
  driver_expense_receipt: `You are reading a receipt for a vehicle/delivery running cost (fuel, toll, parking, or another vehicle-related expense). Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "category": one of "fuel" | "toll" | "parking" | "mileage" | "other",
  "description": a short description of what this expense was for (e.g. vendor/station name),
  "amount": the total amount as a plain number (no currency symbol), else null,
  "expense_date": ISO date (YYYY-MM-DD) if visible, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  vehicle_service_receipt: `You are reading a vehicle workshop invoice or service record. Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "service_date": ISO date (YYYY-MM-DD) the service was done, if visible, else null,
  "next_service_date": ISO date (YYYY-MM-DD) of the next recommended service, if visible, else null,
  "cost": the total cost as a plain number (no currency symbol), else null,
  "notes": a short description of the work done, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  supplier_invoice: `You are reading a supplier invoice or bill. Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "supplier_name": the supplier/vendor's name as printed, else null,
  "invoice_number": the invoice number as printed, else null,
  "invoice_date": ISO date (YYYY-MM-DD) if visible, else null,
  "due_date": ISO date (YYYY-MM-DD) if visible, else null,
  "amount": the total amount payable as a plain number (no currency symbol), else null,
  "items": [
    { "item_name": "as written on the invoice", "quantity": a plain number, "unit_price": a plain number if visible, else null }
  ]
}
List every distinct line item you can identify. If a field is not legible or you are not confident, use null for it rather than guessing.`,
  company_expense: `You are reading a receipt or invoice for a general company expense (utilities, rent, office supplies, insurance, etc). Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "category": a short category name as best guess (e.g. "Utilities", "Rent & Facilities", "Supplies & Equipment", "Other"),
  "description": a short description of what this expense was for (e.g. vendor name + item),
  "amount": the total amount as a plain number (no currency symbol), else null,
  "expense_date": ISO date (YYYY-MM-DD) if visible, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
  finance_payment: `You are reading a document for a payment this company has to make: a supplier invoice or statement, a rental invoice or tenancy payment note, a utility bill (TNB electricity, SAJ water, Indah Water) or a payment voucher. Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "payee_name": the supplier, landlord / payee or utility provider being paid, as printed, else null,
  "bank_name": the payee's bank name if printed (e.g. "Maybank", "CIMB"), else null,
  "bank_account_no": the payee's bank account number exactly as printed, else null,
  "utility_provider": "TNB", "SAJ" or "Indah Water" if the document is clearly from one of them, else null,
  "location": the premises / location / account name the bill is for if printed, else null,
  "utility_account_no": the utility account number exactly as printed on a utility bill, else null,
  "invoice_number": the invoice, bill or statement number as printed, else null,
  "invoice_date": ISO date (YYYY-MM-DD) of the invoice / bill, else null,
  "due_date": ISO date (YYYY-MM-DD) the payment is due, else null,
  "amount": the total amount to pay as a plain number (no currency symbol or commas), else null,
  "billing_month": the month the invoice / bill / payment is for as YYYY-MM, else null,
  "payment_of": the wording after "in payment of" on a voucher (e.g. "A/C AUGUST 2026"), else null,
  "voucher_number": the payment voucher number if this is a voucher, else null,
  "payment_reference": a payment / transfer reference number if shown, else null,
  "payment_date": ISO date (YYYY-MM-DD) the payment was actually made, if shown, else null,
  "company_name": which company the document is addressed to or paid by (e.g. "Signature Solution", "Kasturi Indah", "O2 Life"), else null
}
Never invent or guess any amount, name or number. If a field is not visible or you are not confident, use null for it.`,
  customer_invoice: `You are reading an invoice this company issued to one of its own customers. Extract the following fields and respond with ONLY a JSON object, no other text:
{
  "invoice_number": the invoice number as printed, else null,
  "invoice_date": ISO date (YYYY-MM-DD) if visible, else null,
  "due_date": ISO date (YYYY-MM-DD) if visible, else null,
  "description": a short description of what the invoice is for, else null,
  "amount": the subtotal amount before tax as a plain number (no currency symbol); if the invoice shows no tax at all, use its printed total; else null,
  "tax_amount": the tax/SST amount as a plain number if shown separately, else null
}
If a field is not visible or you are not confident, use null for it rather than guessing.`,
};
