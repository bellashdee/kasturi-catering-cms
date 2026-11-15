import type { ListingReceipt } from "@/lib/finance/receiptListing";
import type { Database } from "@/lib/supabase/types";

/**
 * Matches the receipts of an AutoCount receipt listing to the customers and unpaid invoices of the system (no database access here,
 * so it can be checked on its own). The listing does not say which invoices a receipt paid, so the suggestion is: the one unpaid
 * invoice of exactly that amount, else the oldest unpaid invoices first. The user checks and changes it before saving.
 */

export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

export type OpenInvoice = {
  id: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: number;
  paid: number;
  outstanding: number;
  status: InvoiceStatus;
};

export type ReceiptCustomer = { id: string; name: string; accountCode: string | null };

export type Allocation = { invoiceId: string; amount: number };

/** A payment already in the system: whose invoice it is on, the day and the amount. */
export type RecordedPayment = { customerId: string; date: string; amount: number };

export type ReviewReceipt = ListingReceipt & {
  /** customers of the system this receipt belongs to (more than one when the same AutoCount code is on several) */
  customerIds: string[];
  customerMatch: "code" | "name" | null;
  /** RM already recorded in the system for this customer on this date (any invoice), set against this receipt */
  alreadyRecorded: number;
  status: "recorded" | "partly_recorded" | "ready" | "part_no_invoice" | "no_invoice" | "no_customer";
  suggestion: Allocation[];
  /** how the invoices were picked: one unpaid invoice of exactly this amount, a few that add up to it exactly, or the oldest unpaid first */
  basis: "exact" | "combination" | "oldest" | null;
};

export const cents = (n: number) => Math.round(n * 100) / 100;

export const normName = (s: string) =>
  s
    .toUpperCase()
    .replace(/\b(SDN\.?\s*BHD\.?|BERHAD|BHD)\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** "300-B001 (KI); 300-B004 (KI)" → ["300-B001", "300-B004"] */
export const codesOf = (accountCode: string | null): string[] => (accountCode ?? "").toUpperCase().match(/\d{3}-[A-Z0-9]{3,5}/g) ?? [];

/**
 * A few unpaid invoices (2 to 4) whose amounts still owed add up to exactly the receipt — a receipt usually pays whole invoices.
 * The oldest such set is taken. Only the 25 oldest invoices are tried, to stay fast.
 */
function exactCombination(items: { id: string; amount: number }[], target: number): { id: string; amount: number }[] | null {
  const list = items.slice(0, 25).map((i) => ({ ...i, c: Math.round(i.amount * 100) }));
  const goal = Math.round(target * 100);
  const pick: number[] = [];
  const walk = (from: number, left: number): boolean => {
    if (left === 0) return pick.length >= 2;
    if (pick.length === 4) return false;
    for (let k = from; k < list.length; k++) {
      if (list[k].c > left) continue;
      pick.push(k);
      if (walk(k + 1, left - list[k].c)) return true;
      pick.pop();
    }
    return false;
  };
  return walk(0, goal) ? pick.map((k) => ({ id: list[k].id, amount: list[k].amount })) : null;
}

/** invoices must be sorted oldest first */
export function matchReceipts(listing: ListingReceipt[], customers: ReceiptCustomer[], invoices: OpenInvoice[], recorded: RecordedPayment[]): ReviewReceipt[] {
  const pool = new Map<string, number>();
  for (const p of recorded) {
    const key = `${p.customerId}|${p.date}`;
    pool.set(key, cents((pool.get(key) ?? 0) + Number(p.amount)));
  }
  const left = new Map(invoices.map((i) => [i.id, i.outstanding]));

  return [...listing]
    .sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line)
    .map((r) => {
      let customerMatch: ReviewReceipt["customerMatch"] = null;
      let ids = customers.filter((c) => codesOf(c.accountCode).includes(r.accountCode)).map((c) => c.id);
      if (ids.length) customerMatch = "code";
      else {
        ids = customers.filter((c) => normName(c.name) === normName(r.customerName)).map((c) => c.id);
        if (ids.length) customerMatch = "name";
      }
      const base = { ...r, customerIds: ids, customerMatch, alreadyRecorded: 0, suggestion: [] as Allocation[], basis: null as ReviewReceipt["basis"] };
      if (!ids.length) return { ...base, status: "no_customer" as const };

      // set this receipt against what is already recorded for the customer that day
      let already = 0;
      for (const id of ids) {
        const key = `${id}|${r.date}`;
        const avail = pool.get(key) ?? 0;
        const take = cents(Math.min(avail, r.amount - already));
        if (take > 0) {
          pool.set(key, cents(avail - take));
          already = cents(already + take);
        }
      }
      if (already >= r.amount - 0.005) return { ...base, alreadyRecorded: already, status: "recorded" as const };

      const need = cents(r.amount - already);
      const own = invoices.filter((i) => ids.includes(i.customerId) && (left.get(i.id) ?? 0) > 0);
      const suggestion: Allocation[] = [];
      let basis: ReviewReceipt["basis"] = null;
      const exact = own.find((i) => Math.abs((left.get(i.id) ?? 0) - need) < 0.005);
      const combo = exact ? null : exactCombination(own.map((i) => ({ id: i.id, amount: left.get(i.id) ?? 0 })), need);
      if (exact) {
        suggestion.push({ invoiceId: exact.id, amount: need });
        basis = "exact";
      } else if (combo) {
        for (const c of combo) suggestion.push({ invoiceId: c.id, amount: c.amount });
        basis = "combination";
      } else {
        let rest = need;
        for (const i of own) {
          if (rest <= 0.005) break;
          const take = cents(Math.min(rest, left.get(i.id) ?? 0));
          suggestion.push({ invoiceId: i.id, amount: take });
          rest = cents(rest - take);
        }
        if (suggestion.length) basis = "oldest";
      }
      for (const s of suggestion) left.set(s.invoiceId, cents((left.get(s.invoiceId) ?? 0) - s.amount));
      const linked = cents(suggestion.reduce((t, s) => t + s.amount, 0));
      const status: ReviewReceipt["status"] = already > 0 ? "partly_recorded" : linked === 0 ? "no_invoice" : linked < need - 0.005 ? "part_no_invoice" : "ready";
      return { ...base, alreadyRecorded: already, suggestion, basis, status };
    });
}
