import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { fetchAll, payeeMatcher } from "@/lib/procurement/soa";

type DB = SupabaseClient<Database>;

/**
 * The supplier ledger of a period, kept per company: the opening balance carried forward from before the period, every posted transaction
 * of the period and the closing balance. Only actual records are used (no estimate, no sample figure):
 *
 *  - IN   purchase invoice keyed in (not a draft)                      raises what we owe (CR)
 *  - DN   debit note (supplier_notes, or an invoice numbered "-DN-")   raises what we owe (CR)
 *  - CN   credit note / purchase return                                lowers what we owe (DR)
 *  - PV   payment voucher paid in Admin & Finance → Supplier Payment   lowers what we owe (DR), matched to the supplier of the same company
 *  - PAY  a payment recorded against one invoice, or a part payment of a PV that is not fully paid yet (DR)
 *  - ALLOC how a paid PV was allocated to invoices: shown for reference, the PV itself already lowered the balance (no effect)
 *
 * The same supplier name in two companies is two ledgers: nothing is ever added across companies except in the consolidated summary,
 * which still lists each company on its own line.
 */
export type LedgerKind = "IN" | "DN" | "CN" | "PV" | "PAY" | "ALLOC";
export type LedgerLine = {
  date: string;
  kind: LedgerKind;
  ref: string;
  description: string;
  /** raises the balance owed (invoice, debit note) */
  cr: number;
  /** lowers the balance owed (payment, credit note) */
  dr: number;
  /** ALLOC lines are memo lines: they do not change the balance */
  memo: boolean;
  balance: number;
};
export type LedgerTotals = { opening: number; invoices: number; debitNotes: number; creditNotes: number; payments: number; allocated: number; closing: number };
export type SupplierLedger = {
  companyId: string;
  supplierId: string;
  supplierName: string;
  accountCode: string | null;
  isActive: boolean;
  lines: LedgerLine[];
  totals: LedgerTotals;
};
export type CompanyLedger = { companyId: string; companyName: string; suppliers: SupplierLedger[]; totals: LedgerTotals; canSeePayments: boolean };
export type UnmatchedVoucher = { companyId: string; payee: string; amount: number; paidDate: string | null; reference: string; reason: string };
export type LedgerReport = { periodStart: string; periodEnd: string; companies: CompanyLedger[]; consolidated: LedgerTotals; unmatchedVouchers: UnmatchedVoucher[] };
export type LedgerSort = "name_asc" | "name_desc" | "closing_desc" | "closing_asc";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const KIND_ORDER: Record<LedgerKind, number> = { IN: 0, DN: 1, CN: 2, PV: 3, PAY: 4, ALLOC: 5 };
export const emptyTotals = (): LedgerTotals => ({ opening: 0, invoices: 0, debitNotes: 0, creditNotes: 0, payments: 0, allocated: 0, closing: 0 });

export function addTotals(a: LedgerTotals, b: LedgerTotals): LedgerTotals {
  return {
    opening: r2(a.opening + b.opening),
    invoices: r2(a.invoices + b.invoices),
    debitNotes: r2(a.debitNotes + b.debitNotes),
    creditNotes: r2(a.creditNotes + b.creditNotes),
    payments: r2(a.payments + b.payments),
    allocated: r2(a.allocated + b.allocated),
    closing: r2(a.closing + b.closing),
  };
}

/** A debit note keyed in as an invoice has "-DN-" in its number (like AKF-DN-2609-0128). */
export const isDebitNoteNumber = (n: string) => /(^|[-\s])DN[-\s]/i.test(n);

type RawLine = Omit<LedgerLine, "balance">;

export async function loadSupplierLedgers(
  supabase: DB,
  params: { companyIds: string[]; supplierId?: string | null; periodStart: string; periodEnd: string; sort?: LedgerSort },
): Promise<LedgerReport> {
  const { companyIds, supplierId, periodStart, periodEnd } = params;
  if (companyIds.length === 0) return { periodStart, periodEnd, companies: [], consolidated: emptyTotals(), unmatchedVouchers: [] };

  const [companies, suppliers, invoices, notes, payments, vouchers, allocations, paymentRights] = await Promise.all([
    supabase.from("companies").select("id, name").in("id", companyIds).then((r) => r.data ?? []),
    fetchAll((from, to) => {
      let q = supabase.from("suppliers").select("id, company_id, name, account_code, is_active").in("company_id", companyIds);
      if (supplierId) q = q.eq("id", supplierId);
      return q.order("name").order("id").range(from, to);
    }),
    fetchAll((from, to) => {
      let q = supabase.from("supplier_invoices").select("id, company_id, supplier_id, invoice_number, invoice_date, amount").in("company_id", companyIds).neq("status", "draft").lte("invoice_date", periodEnd);
      if (supplierId) q = q.eq("supplier_id", supplierId);
      return q.order("id").range(from, to);
    }),
    fetchAll((from, to) => {
      let q = supabase.from("supplier_notes").select("id, company_id, supplier_id, note_type, note_number, note_date, amount").in("company_id", companyIds).lte("note_date", periodEnd);
      if (supplierId) q = q.eq("supplier_id", supplierId);
      return q.order("id").range(from, to);
    }),
    fetchAll((from, to) =>
      supabase
        .from("supplier_payments")
        .select("id, company_id, supplier_invoice_id, finance_payment_id, amount, payment_date, reference_number")
        .in("company_id", companyIds)
        .eq("status", "paid")
        .order("id")
        .range(from, to),
    ),
    // paid PVs, and unpaid PVs (their part payments count) of Admin & Finance → Supplier Payment
    fetchAll((from, to) =>
      supabase
        .from("finance_payments")
        .select("id, company_id, payee_name, amount, status, paid_date, voucher_number, payment_reference, invoice_number")
        .in("company_id", companyIds)
        .eq("category", "supplier")
        .neq("status", "cancelled")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("supplier_pv_allocations").select("supplier_payment_id").in("company_id", companyIds).not("supplier_payment_id", "is", null).order("id").range(from, to),
    ),
    Promise.all(companyIds.map(async (id) => [id, (await supabase.rpc("user_can_manage_payments", { target_company_id: id, target_category: "supplier" })).data === true] as const)),
  ]);

  // every supplier of every company, even when two companies use the same supplier name: one ledger each
  const allSuppliers = suppliers;
  const supplierOf = new Map(allSuppliers.map((s) => [s.id, s]));
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const findSupplier = payeeMatcher(
    // the PV payee is matched against every supplier of the company, not only the one asked for, so a PV is never given to the wrong one
    supplierId ? await allSuppliersOf(supabase, companyIds) : allSuppliers,
  );
  const lines = new Map<string, RawLine[]>();
  const add = (sid: string, l: RawLine) => {
    if (!supplierOf.has(sid)) return;
    const list = lines.get(sid);
    if (list) list.push(l);
    else lines.set(sid, [l]);
  };

  for (const i of invoices) {
    const dn = isDebitNoteNumber(i.invoice_number);
    add(i.supplier_id, { date: i.invoice_date, kind: dn ? "DN" : "IN", ref: i.invoice_number, description: dn ? "Debit note" : "Purchase invoice", cr: Number(i.amount), dr: 0, memo: false });
  }
  for (const n of notes) {
    if (n.note_type === "credit") add(n.supplier_id, { date: n.note_date, kind: "CN", ref: n.note_number, description: "Credit note / purchase return", cr: 0, dr: Number(n.amount), memo: false });
    else add(n.supplier_id, { date: n.note_date, kind: "DN", ref: n.note_number, description: "Debit note", cr: Number(n.amount), dr: 0, memo: false });
  }

  const postedAllocations = new Set(allocations.map((a) => a.supplier_payment_id as string));
  const partsByVoucher = new Map<string, typeof payments>();
  for (const p of payments) if (p.finance_payment_id) partsByVoucher.set(p.finance_payment_id, [...(partsByVoucher.get(p.finance_payment_id) ?? []), p]);

  const unmatchedVouchers: UnmatchedVoucher[] = [];
  const voucherSupplier = new Map<string, string>();
  for (const v of vouchers) {
    const sid = findSupplier(v.company_id, v.payee_name ?? "");
    const reference = v.voucher_number || v.payment_reference || v.invoice_number || "";
    const parts = partsByVoucher.get(v.id) ?? [];
    if (!sid) {
      if (v.status === "paid" || parts.length > 0) {
        if (!supplierId) unmatchedVouchers.push({ companyId: v.company_id, payee: v.payee_name ?? "", amount: Number(v.amount), paidDate: v.paid_date, reference, reason: "The payee name does not match one supplier of this company." });
      }
      continue;
    }
    voucherSupplier.set(v.id, sid);
    const label = v.voucher_number ? `PV ${v.voucher_number}` : "Payment voucher";
    if (parts.length > 0) {
      // part payments recorded one by one: each on its own date
      for (const p of parts) {
        if (!p.payment_date || p.payment_date > periodEnd) continue;
        add(sid, { date: p.payment_date, kind: "PAY", ref: p.reference_number || reference, description: `${label} · part payment`, cr: 0, dr: Number(p.amount), memo: false });
      }
    } else if (v.status === "paid") {
      if (!v.paid_date) {
        if (!supplierId || sid === supplierId) unmatchedVouchers.push({ companyId: v.company_id, payee: v.payee_name ?? "", amount: Number(v.amount), paidDate: null, reference, reason: "Marked paid without the payment date: it cannot be placed in a month yet." });
        continue;
      }
      if (v.paid_date > periodEnd) continue;
      add(sid, { date: v.paid_date, kind: "PV", ref: reference, description: `${label}${v.payment_reference ? ` · ref ${v.payment_reference}` : ""}`, cr: 0, dr: Number(v.amount), memo: false });
    }
  }

  for (const p of payments) {
    if (!p.supplier_invoice_id) continue; // part payments of a PV are handled above
    const inv = invoiceById.get(p.supplier_invoice_id);
    if (!inv) continue; // an invoice after the period, or a draft
    const date = p.payment_date ?? inv.invoice_date;
    if (date > periodEnd) continue;
    if (postedAllocations.has(p.id)) {
      add(inv.supplier_id, { date, kind: "ALLOC", ref: p.reference_number || "", description: `Allocated to invoice ${inv.invoice_number}`, cr: 0, dr: Number(p.amount), memo: true });
    } else {
      add(inv.supplier_id, {
        date,
        kind: "PAY",
        ref: p.reference_number || inv.invoice_number,
        description: p.payment_date ? `Payment of invoice ${inv.invoice_number}` : `Paid / adjusted · invoice ${inv.invoice_number}`,
        cr: 0,
        dr: Number(p.amount),
        memo: false,
      });
    }
  }

  const ledgers: SupplierLedger[] = allSuppliers.map((s) => {
    const raw = (lines.get(s.id) ?? []).sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.ref.localeCompare(b.ref));
    const totals = emptyTotals();
    const shown: LedgerLine[] = [];
    let bal = 0;
    for (const l of raw) {
      const effect = l.memo ? 0 : l.cr - l.dr;
      if (l.date < periodStart) {
        totals.opening = r2(totals.opening + effect);
        bal = r2(bal + effect);
        continue;
      }
      bal = r2(bal + effect);
      shown.push({ ...l, balance: bal });
      if (l.kind === "IN") totals.invoices = r2(totals.invoices + l.cr);
      else if (l.kind === "DN") totals.debitNotes = r2(totals.debitNotes + l.cr);
      else if (l.kind === "CN") totals.creditNotes = r2(totals.creditNotes + l.dr);
      else if (l.kind === "ALLOC") totals.allocated = r2(totals.allocated + l.dr);
      else totals.payments = r2(totals.payments + l.dr);
    }
    totals.closing = bal;
    return { companyId: s.company_id, supplierId: s.id, supplierName: s.name, accountCode: s.account_code, isActive: s.is_active, lines: shown, totals };
  });

  const sort = params.sort ?? "name_asc";
  const cmp = (a: SupplierLedger, b: SupplierLedger) => {
    const byName = a.supplierName.localeCompare(b.supplierName, "en", { sensitivity: "base" });
    if (sort === "name_desc") return -byName;
    if (sort === "closing_desc") return b.totals.closing - a.totals.closing || byName;
    if (sort === "closing_asc") return a.totals.closing - b.totals.closing || byName;
    return byName;
  };
  const rights = new Map(paymentRights);
  const companyLedgers: CompanyLedger[] = companies
    .map((c) => {
      const list = ledgers.filter((l) => l.companyId === c.id).sort(cmp);
      return { companyId: c.id, companyName: c.name, suppliers: list, totals: list.reduce((t, l) => addTotals(t, l.totals), emptyTotals()), canSeePayments: rights.get(c.id) === true };
    })
    .sort((a, b) => a.companyName.localeCompare(b.companyName));

  return {
    periodStart,
    periodEnd,
    companies: companyLedgers,
    consolidated: companyLedgers.reduce((t, c) => addTotals(t, c.totals), emptyTotals()),
    unmatchedVouchers,
  };
}

async function allSuppliersOf(supabase: DB, companyIds: string[]) {
  return fetchAll((from, to) => supabase.from("suppliers").select("id, company_id, name").in("company_id", companyIds).order("id").range(from, to));
}

/** "2026-11" → first and last day of the month. */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}
