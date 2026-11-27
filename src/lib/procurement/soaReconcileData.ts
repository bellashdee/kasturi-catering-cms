import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { fetchAll, payeeMatcher } from "@/lib/procurement/soa";
import { isDebitNoteNumber, loadSupplierLedgers } from "@/lib/finance/supplierLedger";
import { explainDifference, type BalanceSide, type OurRecord, type SoaLineStatus } from "@/lib/procurement/soaMatch";

type DB = SupabaseClient<Database>;

/**
 * Our records of one supplier of one company up to the end of the period, in the shape the matching needs: invoices and debit notes,
 * credit notes, and payments (paid PVs of Admin & Finance matched to this supplier, their part payments, and payments recorded against
 * an invoice). Another company's records are never included, even for a supplier with the same name.
 */
export async function loadOurRecords(supabase: DB, companyId: string, supplierId: string, periodStart: string, periodEnd: string): Promise<OurRecord[]> {
  const [invoices, notes, vouchers, payments, suppliers, allocations] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("supplier_invoices")
        .select("id, invoice_number, autocount_invoice_no, invoice_date, amount")
        .eq("company_id", companyId)
        .eq("supplier_id", supplierId)
        .neq("status", "draft")
        .lte("invoice_date", periodEnd)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) => supabase.from("supplier_notes").select("id, note_type, note_number, note_date, amount").eq("company_id", companyId).eq("supplier_id", supplierId).lte("note_date", periodEnd).order("id").range(from, to)),
    fetchAll((from, to) =>
      supabase
        .from("finance_payments")
        .select("id, payee_name, amount, status, paid_date, voucher_number, payment_reference, invoice_number")
        .eq("company_id", companyId)
        .eq("category", "supplier")
        .neq("status", "cancelled")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("supplier_payments").select("id, supplier_invoice_id, finance_payment_id, amount, payment_date, reference_number").eq("company_id", companyId).eq("status", "paid").order("id").range(from, to),
    ),
    fetchAll((from, to) => supabase.from("suppliers").select("id, company_id, name").eq("company_id", companyId).order("id").range(from, to)),
    fetchAll((from, to) => supabase.from("supplier_pv_allocations").select("supplier_payment_id").eq("company_id", companyId).not("supplier_payment_id", "is", null).order("id").range(from, to)),
  ]);
  const inPeriod = (d: string) => d >= periodStart && d <= periodEnd;
  const out: OurRecord[] = [];
  const invoiceIds = new Map(invoices.map((i) => [i.id, i]));
  for (const i of invoices) {
    out.push({
      table: "supplier_invoices",
      id: i.id,
      kind: isDebitNoteNumber(i.invoice_number) ? "debit_note" : "invoice",
      ref: i.invoice_number,
      altRefs: i.autocount_invoice_no ? [i.autocount_invoice_no] : [],
      date: i.invoice_date,
      amount: Math.abs(Number(i.amount)),
      inPeriod: inPeriod(i.invoice_date),
    });
  }
  for (const n of notes) {
    out.push({ table: "supplier_notes", id: n.id, kind: n.note_type === "credit" ? "credit_note" : "debit_note", ref: n.note_number, altRefs: [], date: n.note_date, amount: Math.abs(Number(n.amount)), inPeriod: inPeriod(n.note_date) });
  }
  const find = payeeMatcher(suppliers);
  const posted = new Set(allocations.map((a) => a.supplier_payment_id as string));
  const partsBy = new Map<string, typeof payments>();
  for (const p of payments) if (p.finance_payment_id) partsBy.set(p.finance_payment_id, [...(partsBy.get(p.finance_payment_id) ?? []), p]);
  for (const v of vouchers) {
    if (find(companyId, v.payee_name ?? "") !== supplierId) continue;
    const refs = [v.voucher_number, v.payment_reference, v.invoice_number].filter((x): x is string => !!x);
    const parts = partsBy.get(v.id) ?? [];
    if (parts.length > 0) {
      for (const p of parts) {
        if (!p.payment_date || p.payment_date > periodEnd) continue;
        out.push({ table: "supplier_payments", id: p.id, kind: "payment", ref: p.reference_number || refs[0] || "", altRefs: refs, date: p.payment_date, amount: Number(p.amount), inPeriod: inPeriod(p.payment_date) });
      }
    } else if (v.status === "paid" && v.paid_date && v.paid_date <= periodEnd) {
      out.push({ table: "finance_payments", id: v.id, kind: "payment", ref: refs[0] ?? "", altRefs: refs.slice(1), date: v.paid_date, amount: Number(v.amount), inPeriod: inPeriod(v.paid_date) });
    }
  }
  for (const p of payments) {
    if (!p.supplier_invoice_id || posted.has(p.id)) continue;
    const inv = invoiceIds.get(p.supplier_invoice_id);
    if (!inv) continue;
    const date = p.payment_date ?? inv.invoice_date;
    if (date > periodEnd) continue;
    out.push({ table: "supplier_payments", id: p.id, kind: "payment", ref: p.reference_number || inv.invoice_number, altRefs: [inv.invoice_number], date, amount: Number(p.amount), inPeriod: inPeriod(date) });
  }
  return out;
}

/** Our balances for the same company, supplier and period, from the supplier ledger (the same figures as the SOA report). */
export async function loadOurBalances(supabase: DB, companyId: string, supplierId: string, periodStart: string, periodEnd: string): Promise<BalanceSide> {
  const report = await loadSupplierLedgers(supabase, { companyIds: [companyId], supplierId, periodStart, periodEnd });
  const t = report.companies[0]?.suppliers[0]?.totals;
  if (!t) return { opening: 0, invoices: 0, payments: 0, creditNotes: 0, debitNotes: 0, closing: 0 };
  return { opening: t.opening, invoices: t.invoices, payments: t.payments, creditNotes: t.creditNotes, debitNotes: t.debitNotes, closing: t.closing };
}

export type OutstandingInvoice = {
  id: string;
  number: string;
  date: string;
  amount: number;
  paid: number;
  heldElsewhere: number;
  outstanding: number;
  onSoa: boolean;
  /** a monthly PV of the invoice's month is already paid in Admin & Finance: the invoice may already be paid by it */
  monthPv: string | null;
};

/** The invoices of a supplier (one company) that still have something to pay: amount − payments posted − amounts held by other open PV drafts. */
export async function loadOutstandingInvoices(supabase: DB, params: { companyId: string; supplierId: string; supplierName: string; excludeDraftId?: string; soaInvoiceIds: Set<string> }): Promise<OutstandingInvoice[]> {
  const { companyId, supplierId } = params;
  const [invoices, payments, allocs, vouchers, suppliers] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from("supplier_invoices").select("id, invoice_number, invoice_date, amount, status").eq("company_id", companyId).eq("supplier_id", supplierId).not("status", "in", "(draft,paid)").order("invoice_date").order("id").range(from, to),
    ),
    fetchAll((from, to) => supabase.from("supplier_payments").select("supplier_invoice_id, amount").eq("company_id", companyId).eq("status", "paid").not("supplier_invoice_id", "is", null).order("id").range(from, to)),
    fetchAll((from, to) =>
      supabase.from("supplier_pv_allocations").select("pv_draft_id, supplier_invoice_id, amount, supplier_payment_id, supplier_pv_drafts!inner(status)").eq("company_id", companyId).is("supplier_payment_id", null).order("id").range(from, to),
    ),
    fetchAll((from, to) => supabase.from("finance_payments").select("payee_name, period_month, status, voucher_number").eq("company_id", companyId).eq("category", "supplier").eq("status", "paid").order("id").range(from, to)),
    fetchAll((from, to) => supabase.from("suppliers").select("id, company_id, name").eq("company_id", companyId).order("id").range(from, to)),
  ]);
  const paid = new Map<string, number>();
  for (const p of payments) paid.set(p.supplier_invoice_id as string, (paid.get(p.supplier_invoice_id as string) ?? 0) + Number(p.amount));
  const held = new Map<string, number>();
  for (const a of allocs) {
    const st = (a.supplier_pv_drafts as unknown as { status: string } | null)?.status;
    if (a.pv_draft_id === params.excludeDraftId || !st || !["draft", "submitted", "approved"].includes(st)) continue;
    held.set(a.supplier_invoice_id, (held.get(a.supplier_invoice_id) ?? 0) + Number(a.amount));
  }
  const find = payeeMatcher(suppliers);
  const pvByMonth = new Map<string, string>();
  for (const v of vouchers) if (find(companyId, v.payee_name ?? "") === supplierId) pvByMonth.set(v.period_month.slice(0, 7), v.voucher_number || "PV");
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return invoices
    .map((i) => {
      const amount = Number(i.amount);
      const p = r2(paid.get(i.id) ?? 0);
      const h = r2(held.get(i.id) ?? 0);
      return { id: i.id, number: i.invoice_number, date: i.invoice_date, amount, paid: p, heldElsewhere: h, outstanding: r2(amount - p - h), onSoa: params.soaInvoiceIds.has(i.id), monthPv: pvByMonth.get(i.invoice_date.slice(0, 7)) ?? null };
    })
    .filter((i) => i.outstanding > 0.004 || i.heldElsewhere > 0);
}

type ReconRow = Database["public"]["Tables"]["supplier_soa_reconciliations"]["Row"];
type LineRow = Database["public"]["Tables"]["supplier_soa_recon_lines"]["Row"];

export function balanceSides(recon: ReconRow): { supplier: BalanceSide; ours: BalanceSide } {
  const n = (v: number | null) => Number(v ?? 0);
  return {
    supplier: { opening: n(recon.supplier_opening), invoices: n(recon.supplier_invoices), payments: n(recon.supplier_payments), creditNotes: n(recon.supplier_credit_notes), debitNotes: n(recon.supplier_debit_notes), closing: n(recon.supplier_closing) },
    ours: { opening: n(recon.our_opening), invoices: n(recon.our_invoices), payments: n(recon.our_payments), creditNotes: n(recon.our_credit_notes), debitNotes: n(recon.our_debit_notes), closing: n(recon.our_closing) },
  };
}

/** The balance comparison with the likely causes of the difference, from the saved lines (for the page and the report). */
export function differenceBreakdown(recon: ReconRow, rows: LineRow[]) {
  const { supplier, ours } = balanceSides(recon);
  const sup = rows.filter((r) => r.source === "supplier" && r.line_type !== "opening");
  const left = rows.filter((r) => r.source === "ours");
  return explainDifference(
    supplier,
    ours,
    sup.map((r) => ({ status: r.status as SoaLineStatus, amount: Number(r.amount), matchedAmount: r.matched_amount === null ? null : Number(r.matched_amount), outside: !!r.line_date && (r.line_date < recon.period_start || r.line_date > recon.period_end) })),
    left.map((r) => ({ status: r.status, amount: Number(r.amount), inTransit: /transit/i.test(r.likely_cause ?? "") })),
  );
}
