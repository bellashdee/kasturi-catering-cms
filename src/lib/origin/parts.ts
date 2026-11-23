import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { CostRow } from "@/lib/finance/queries";
import { billList, type TotalPart } from "./kinds";

type DB = SupabaseClient<Database>;

/** Invoices that are not sales (yet), as in salesByCompanyMonth. */
const NOT_SALES = ["draft", "pending_review"];

/** A cost row as one part of a total. */
export function costPart(r: CostRow, companyName?: string | null): TotalPart {
  return { group: r.source, amount: r.amount, date: r.date, label: [r.category, r.invoiceNo, r.details, companyName].filter(Boolean).join(" · "), origin: r.origin, billIds: r.billIds };
}

/**
 * The records behind the sales of a month (the rule of salesByCompanyMonth): for each company, the monthly sales keyed in from AutoCount,
 * or, for a company with none keyed for the month, the customer invoices issued in it (before tax), each with its invoice file.
 */
export async function salesParts(supabase: DB, companyIds: string[], year: number, month: number, companyName: Map<string, string>): Promise<TotalPart[]> {
  const mm = String(month).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const [keyedRes, invoicesRes] = await Promise.all([
    supabase.from("monthly_sales").select("id, company_id, sales_type, sales_amount").in("company_id", companyIds).eq("year", year).eq("month", month),
    supabase.from("customer_invoices").select("id, company_id, invoice_number, invoice_date, amount, status, document_id, customers(name)").in("company_id", companyIds).gte("invoice_date", `${year}-${mm}-01`).lte("invoice_date", `${year}-${mm}-${last}`).range(0, 9999),
  ]);
  const keyedCompanies = new Set((keyedRes.data ?? []).map((r) => r.company_id));
  const keyed: TotalPart[] = (keyedRes.data ?? []).map((r) => ({
    group: "Monthly sales (AutoCount)",
    amount: Number(r.sales_amount),
    date: `${year}-${mm}`,
    label: [companyName.get(r.company_id), r.sales_type === "total" ? null : r.sales_type].filter(Boolean).join(" · "),
    origin: { kind: "monthly_sales", id: r.id },
    billIds: [],
  }));
  const invoiced: TotalPart[] = (invoicesRes.data ?? [])
    .filter((i) => !keyedCompanies.has(i.company_id) && !NOT_SALES.includes(i.status))
    .map((i) => ({
      group: "Invoices issued (no monthly sales keyed in)",
      amount: Number(i.amount),
      date: i.invoice_date,
      label: [i.invoice_number, (i.customers as { name?: string } | null)?.name, companyName.get(i.company_id)].filter(Boolean).join(" · "),
      origin: { kind: "customer_invoice", id: i.id },
      billIds: billList(i.document_id),
    }));
  return [...keyed, ...invoiced];
}
