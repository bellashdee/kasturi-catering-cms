import { countsForMoney } from "@/lib/catering/constants";
import type { RevenueEntry } from "@/lib/finance/eventPnl";

/**
 * ONE rule for the money of an event, used by every page that shows event revenue (Event P&L, Event Report, Catering Report,
 * Event Summary), so their figures always tally.
 *
 * Which events count in totals and in "number of events": every event except the date-only ones, Ready for Planning, and those that are
 * not (or no longer) a sale — Cancelled, Enquiry and Quoted. Lists may still show those, but they are never added up.
 *
 * The revenue of an event:
 *   1. the revenue recorded in its Event P&L (entries), when there is any;
 *   2. otherwise its linked customer invoices (amount before tax; Draft and Pending Review are not invoices yet);
 *   3. otherwise the amount of the event itself (the quotation amount).
 */
export const NOT_A_SALE_STATUSES = ["cancelled", "enquiry", "quoted"];

export const countsInTotals = (status: string | null | undefined) => countsForMoney(status) && !NOT_A_SALE_STATUSES.includes(status ?? "");

export type RevenueSource = "entries" | "invoice" | "quotation" | "none";

export const REVENUE_SOURCE_LABEL: Record<RevenueSource, string> = {
  entries: "Recorded in the P&L",
  invoice: "From the invoice (not recorded in the P&L yet)",
  quotation: "Quotation amount (no invoice yet)",
  none: "No amount yet",
};

const NOT_AN_INVOICE = ["draft", "pending_review"];

/** The revenue entries to calculate an event with: its own, or one standing in for them (from its invoices or its quotation amount). */
export function revenueEntriesFor(
  entries: RevenueEntry[],
  invoices: { amount: number | string | null; status: string | null }[],
  eventAmount: number | string | null | undefined,
): { entries: RevenueEntry[]; source: RevenueSource } {
  if (entries.length > 0) return { entries, source: "entries" };
  const real = invoices.filter((i) => !NOT_AN_INVOICE.includes(i.status ?? ""));
  if (real.length > 0) {
    const amount = Math.round(real.reduce((t, i) => t + Number(i.amount ?? 0), 0) * 100) / 100;
    return { entries: [{ entry_type: "sales", amount }], source: "invoice" };
  }
  const quoted = Number(eventAmount ?? 0);
  if (quoted > 0) return { entries: [{ entry_type: "sales", amount: quoted }], source: "quotation" };
  return { entries: [], source: "none" };
}
