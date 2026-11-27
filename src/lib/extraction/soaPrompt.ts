/**
 * A supplier's Statement of Account (SOA / creditor or debtor statement), read line by line so it can be reconciled with our records.
 * The statement is external: every value is copied exactly as printed, nothing is calculated or completed.
 */
export const SUPPLIER_SOA_PROMPT = `You are reading a supplier's Statement of Account (SOA, "Statement", "Penyata Akaun", debtor/customer statement) sent to a catering company in Malaysia. It may be a PDF, a scan, a photo, a spreadsheet or a Word file, one or many pages. Copy EVERY transaction line, in the order printed, across EVERY page, and respond with ONLY a JSON object, no other text:
{
  "supplier_name": the supplier's name as printed at the top (the company that issued the statement), else null,
  "customer_name": the customer the statement is addressed to (our company) as printed, else null,
  "account_no": the account / customer code as printed, else null,
  "statement_date": ISO date (YYYY-MM-DD) of the statement, else null,
  "period_from": ISO date the statement period starts, if printed, else null,
  "period_to": ISO date the statement period ends, if printed, else null,
  "currency": the currency printed, else null,
  "opening_balance": the opening / brought-forward balance as a plain number exactly as printed (negative if printed in brackets or marked CR), else null,
  "closing_balance": the closing / total outstanding / balance due as a plain number exactly as printed, else null,
  "items": [
    {
      "date": the line date exactly as printed (keep the printed format, e.g. "05/11/2026"),
      "type": one of "opening" | "invoice" | "payment" | "credit_note" | "debit_note" | "other" (opening = balance b/f line; payment = payment / receipt / OR / contra / knock-off received from the customer),
      "reference": the document number of the line exactly as printed (invoice no., OR / receipt no., CN / DN no., cheque or bank reference), else null,
      "description": the description / particulars printed, else null,
      "debit": the amount in the Debit column as a plain number, else null,
      "credit": the amount in the Credit column as a plain number, else null,
      "amount": the amount of the line when the statement has a single amount column (plain number, negative if printed in brackets or with CR / minus), else null,
      "balance": the running balance printed on the line as a plain number, else null
    }
  ]
}
Rules for the items:
- One object per printed line; never merge two lines or split one. Include the opening balance line (type "opening") when it is printed as a line.
- Do not include page totals, ageing tables (current / 30 / 60 / 90 days), bank details or remittance slips as items.
- Copy numbers exactly as printed (no rounding, no currency symbol, no thousand separators). Never compute a missing amount or balance.
- If a value is not visible or you are not confident, use null rather than guessing.`;
