import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { suggestItemCostType, type CostEntry } from "@/lib/finance/eventPnl";

type DB = SupabaseClient<Database>;

/** An AutoCount invoice number as it is stored and matched: no spaces, upper case (INV-KI2611/004). */
export function normalizeAutoCountNo(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A supplier invoice counted as a direct cost of an event through its AutoCount Invoice No. */
export type AutoCountSupplierInvoice = {
  eventId: string;
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  autoCountNo: string;
  supplierName: string | null;
  companyName: string;
  /** The invoice as direct costs: its lines by category (as proposed from the item names); what the lines do not cover is "Others". */
  costs: (CostEntry & { cost_class: "direct"; cost_basis: "actual"; amount: number })[];
};

function costsOf(amount: number, items: { item_name: string; line_total: number }[]): AutoCountSupplierInvoice["costs"] {
  const byType = new Map<string, number>();
  for (const it of items) {
    const type = suggestItemCostType(it.item_name ?? "") || "others";
    byType.set(type, (byType.get(type) ?? 0) + Number(it.line_total ?? 0));
  }
  const covered = [...byType.values()].reduce((t, v) => t + v, 0);
  const rest = round2(amount - covered);
  if (Math.abs(rest) >= 0.01) byType.set("others", (byType.get("others") ?? 0) + rest);
  return [...byType.entries()].filter(([, v]) => round2(v) !== 0).map(([cost_type, v]) => ({ cost_class: "direct", cost_type, cost_basis: "actual", amount: round2(v) }));
}

/**
 * The supplier invoices whose AutoCount Invoice No. is a customer invoice of these events (and that are not already an event cost
 * entry), so they count in the Event P&L straight away. The database checks the person may see the P&L of each event.
 */
export async function autoCountSupplierInvoices(supabase: DB, eventIds: string[]): Promise<AutoCountSupplierInvoice[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase.rpc("event_autocount_supplier_invoices", { p_event_ids: eventIds });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    eventId: r.catering_event_id,
    id: r.supplier_invoice_id,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    amount: Number(r.amount),
    autoCountNo: r.autocount_invoice_no,
    supplierName: r.supplier_name,
    companyName: r.company_name,
    costs: costsOf(Number(r.amount), Array.isArray(r.items) ? r.items : []),
  }));
}

/** The direct costs of one event that come from supplier invoices with its AutoCount invoice number. */
export function autoCountCostsOf(list: AutoCountSupplierInvoice[], eventId: string) {
  return list.filter((s) => s.eventId === eventId).flatMap((s) => s.costs);
}
