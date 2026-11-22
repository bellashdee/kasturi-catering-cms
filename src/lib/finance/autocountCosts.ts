import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { DIRECT_COST_TYPE_LABEL, suggestItemCostType, type CostEntry } from "@/lib/finance/eventPnl";

type DB = SupabaseClient<Database>;

/** An AutoCount invoice number as it is stored and matched: no spaces, upper case (INV-KI2611/004). */
export function normalizeAutoCountNo(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

/**
 * The AutoCount invoice number of a cost: only the one typed in its own field. Remarks are just notes: they never link a cost to
 * an event's P&L (Ms. Nabilah, 22 Nov 2026). "" when there is none.
 */
export function autoCountNoFrom(typed: string | null | undefined): string {
  return normalizeAutoCountNo(typed);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type AutoCountSource = "supplier_invoice" | "expense" | "petty_cash" | "staff_claim";

export const AUTOCOUNT_SOURCE_LABEL: Record<AutoCountSource, string> = {
  supplier_invoice: "Supplier invoice",
  expense: "Company expense",
  petty_cash: "Petty cash",
  staff_claim: "Staff claim",
};

/** Where each kind of record opens. */
export function autoCountSourceHref(source: AutoCountSource, id: string): string {
  if (source === "supplier_invoice") return `/supplier-procurement/invoices/${id}`;
  if (source === "expense") return "/spending/expenses";
  // petty cash entries and staff claims are both on the Petty Cash page
  return "/spending/petty-cash";
}

/** A cost (supplier invoice, company expense, petty cash or staff claim) counted in an event through its AutoCount Invoice No. */
export type AutoCountCost = {
  eventId: string;
  source: AutoCountSource;
  id: string;
  /** the supplier's invoice / receipt number */
  reference: string | null;
  date: string;
  amount: number;
  autoCountNo: string;
  /** supplier, or the person who paid */
  partyName: string | null;
  companyName: string;
  /** The record as actual direct costs: by category, as proposed from the item names / category; what is not recognised is "Others". */
  costs: (CostEntry & { cost_class: "direct"; cost_basis: "actual"; amount: number })[];
};

/** The P&L category of an expense / petty cash category ("FRUITS", "DRY GOODS", "TRANSPORTATION & DELIVERY"), else from its words. */
function costTypeOfCategory(categoryText: string | null): string {
  if (!categoryText) return "others";
  const words = (t: string) => t.toUpperCase().replace(/[^A-Z]+/g, " ").trim();
  // the first category of the record, compared word by word with the names of the P&L categories
  const first = words(categoryText.split(/[|,]/)[0] ?? "");
  if (first.length >= 3) {
    for (const [type, label] of Object.entries(DIRECT_COST_TYPE_LABEL)) {
      const name = words(label);
      if (type !== "others" && (first === name || first.startsWith(`${name} `) || name.startsWith(`${first} `))) return type;
    }
  }
  return suggestItemCostType(categoryText) || "others";
}

function costsOf(amount: number, items: { item_name: string; line_total: number }[], categoryText: string | null): AutoCountCost["costs"] {
  const byType = new Map<string, number>();
  for (const it of items) {
    const type = suggestItemCostType(it.item_name ?? "") || "others";
    byType.set(type, (byType.get(type) ?? 0) + Number(it.line_total ?? 0));
  }
  const covered = [...byType.values()].reduce((t, v) => t + v, 0);
  const rest = round2(amount - covered);
  if (Math.abs(rest) >= 0.01) {
    const type = costTypeOfCategory(categoryText);
    byType.set(type, (byType.get(type) ?? 0) + rest);
  }
  return [...byType.entries()].filter(([, v]) => round2(v) !== 0).map(([cost_type, v]) => ({ cost_class: "direct", cost_type, cost_basis: "actual", amount: round2(v) }));
}

/**
 * Every cost keyed in with the AutoCount invoice number of these events (supplier invoices not already an event cost entry,
 * company expenses, petty cash spent and staff claims), so they count in the Event P&L straight away. The database checks the
 * person may see the P&L of each event.
 */
export async function autoCountCosts(supabase: DB, eventIds: string[]): Promise<AutoCountCost[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase.rpc("event_autocount_costs", { p_event_ids: eventIds });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    eventId: r.catering_event_id,
    source: r.source as AutoCountSource,
    id: r.source_id,
    reference: r.reference,
    date: r.cost_date,
    amount: Number(r.amount),
    autoCountNo: r.autocount_invoice_no,
    partyName: r.party_name,
    companyName: r.company_name,
    costs: costsOf(Number(r.amount), Array.isArray(r.items) ? r.items : [], r.category_text),
  }));
}

/** The direct costs of one event that come from records with its AutoCount invoice number. */
export function autoCountCostsOf(list: AutoCountCost[], eventId: string) {
  return list.filter((s) => s.eventId === eventId).flatMap((s) => s.costs);
}

/**
 * The AutoCount Invoice No. to save on a record: what is typed, nothing else (never read from the remarks). A form that does not
 * send the field (undefined) keeps what the record had.
 */
export function autoCountNoOnSave(typed: string | null | undefined, before: string | null | undefined): string | null {
  if (typed === undefined) return before || null;
  return autoCountNoFrom(typed) || null;
}
