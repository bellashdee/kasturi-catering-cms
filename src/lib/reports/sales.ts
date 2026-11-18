import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

/** Invoices that are not sales (yet): drafts and quotation requests waiting for review. */
const NOT_SALES = ["draft", "pending_review"];

/**
 * The one rule for "sales" on every page (Admin dashboard, Monthly Costing, Business Overview, Performance, Invoice Listing):
 * the sales of a company in a month are the monthly sales keyed in for it (Finance > Monthly Sales, from AutoCount); a month with none keyed
 * counts the invoices issued in it, before tax (AutoCount's sales figures leave tax out). `by` holds each company's twelve months (index 0 =
 * January).
 */
export async function salesByCompanyMonth(supabase: DB, companyIds: string[], year: number) {
  const [salesRes, invoicesRes] = await Promise.all([
    supabase.from("monthly_sales").select("company_id, month, sales_type, sales_amount").in("company_id", companyIds).eq("year", year),
    supabase
      .from("customer_invoices")
      .select("company_id, invoice_date, amount, tax_amount, status")
      .in("company_id", companyIds)
      .gte("invoice_date", `${year}-01-01`)
      .lte("invoice_date", `${year}-12-31`)
      .range(0, 9999),
  ]);
  const by = new Map<string, number[]>(companyIds.map((id) => [id, Array<number>(12).fill(0)]));
  const keyed = new Map<string, number>(); // company|month -> sales keyed in
  const split = new Map<string, { catering: number; daily: number }>(); // company|month -> keyed by sales type
  const invoiced = new Map<string, number>(); // company|month -> invoices issued
  for (const s of salesRes.data ?? []) {
    const key = `${s.company_id}|${s.month}`;
    keyed.set(key, (keyed.get(key) ?? 0) + Number(s.sales_amount));
    const sp = split.get(key) ?? { catering: 0, daily: 0 };
    if (s.sales_type === "catering") sp.catering += Number(s.sales_amount);
    if (s.sales_type === "daily") sp.daily += Number(s.sales_amount);
    split.set(key, sp);
  }
  for (const i of invoicesRes.data ?? []) {
    if (NOT_SALES.includes(i.status)) continue;
    const key = `${i.company_id}|${Number(i.invoice_date.slice(5, 7))}`;
    invoiced.set(key, (invoiced.get(key) ?? 0) + Number(i.amount)); // before tax, like the sales keyed in from AutoCount
  }
  for (const id of companyIds) {
    const row = by.get(id) as number[];
    for (let m = 1; m <= 12; m++) {
      const key = `${id}|${m}`;
      row[m - 1] = keyed.has(key) ? (keyed.get(key) as number) : invoiced.get(key) ?? 0;
    }
  }
  return { by, keyed, split, invoiced };
}

/** The twelve monthly totals over all the companies. */
export function totalSalesByMonth(by: Map<string, number[]>) {
  return Array.from({ length: 12 }, (_, m) => Array.from(by.values()).reduce((t, v) => t + v[m], 0));
}
