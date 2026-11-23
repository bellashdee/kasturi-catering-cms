/**
 * Where an amount comes from: the record it was keyed in as. Every page that shows a money amount can pass one of these to
 * <AmountOrigin> so the person can open the bill behind it, or see who keyed it in, when and on which page.
 */
export type OriginKind =
  | "expense"
  | "petty_cash_claim"
  | "petty_cash_book"
  | "finance_payment"
  | "supplier_payment"
  | "supplier_invoice"
  | "driver_expense"
  | "marketing_expense"
  | "payroll"
  | "stock_movement"
  | "event_costing"
  | "event_revenue_entry"
  | "event_cost_entry"
  | "catering_event"
  | "event_pnl"
  | "customer_invoice"
  | "customer_payment"
  | "monthly_sales"
  | "breakdown_item"
  | "rst_sales_line"
  | "rst_day_total"
  | "rst_cash_session";

export type OriginRef = { kind: OriginKind; id: string };

/** The bills (receipts, invoices, vouchers) of a record, the first one first, without repeats. */
export function billList(...ids: (string | null | undefined | (string | null | undefined)[])[]): string[] {
  return Array.from(new Set(ids.flat().filter((id): id is string => !!id)));
}

/** The record of a cost counted in an Event P&L through its AutoCount invoice no. (see event_autocount_costs). */
export function autoCountOrigin(source: "supplier_invoice" | "expense" | "petty_cash" | "staff_claim", id: string): OriginRef {
  const kind: OriginKind = source === "supplier_invoice" ? "supplier_invoice" : source === "expense" ? "expense" : source === "petty_cash" ? "petty_cash_book" : "petty_cash_claim";
  return { kind, id };
}

/** One record that is part of a total (for <TotalOrigin>). */
export type TotalPart = {
  /** where it comes from, as a group in the box ("Company Expenses", "Petty Cash", "AutoCount monthly total" ...) */
  group: string;
  amount: number;
  date?: string | null;
  /** what it was (category, notes, payee ...) */
  label?: string | null;
  origin?: OriginRef | null;
  billIds?: string[];
};
