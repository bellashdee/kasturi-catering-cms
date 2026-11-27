"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { todayInMalaysia } from "@/lib/format";
import { monthLabel } from "@/lib/procurement/vouchers";
import { nameKey } from "@/lib/finance/supplierMonth";
import { loadOutstandingInvoices } from "@/lib/procurement/soaReconcileData";

type DB = Awaited<ReturnType<typeof createClient>>;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}
async function requireManage(supabase: DB, companyId: string) {
  const { data } = await supabase.rpc("user_can_manage_payments", { target_company_id: companyId, target_category: "supplier" });
  if (data !== true) throw new Error("Only Finance / Admin (or the supplier payment editors) of this company can prepare payment vouchers.");
}
async function isApprover(supabase: DB) {
  const { data } = await supabase.rpc("user_can_approve_supplier_payments");
  return data === true;
}
async function requireApprover(supabase: DB) {
  if (!(await isApprover(supabase))) throw new Error("Only the Director of Finance (Ms. Penny Chan) and her PA (Ms. Nabilah) can approve payment vouchers.");
}

async function loadDraft(supabase: DB, id: string) {
  const { data, error } = await supabase.from("supplier_pv_drafts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Payment voucher draft not found.");
  return data;
}

const auditDraft = (companyId: string, id: string, action: string, newValue?: string, previousValue?: string, reason?: string) =>
  logTaskAudit({ companyId, relatedTable: "supplier_pv_drafts", relatedId: id, action, newValue, previousValue, reason });
const auditRecon = (companyId: string, id: string, action: string, newValue?: string, previousValue?: string) =>
  logTaskAudit({ companyId, relatedTable: "supplier_soa_reconciliations", relatedId: id, action, newValue, previousValue });

const paths = (reconId: string) => {
  revalidatePath(`/supplier-procurement/soa/reconcile/${reconId}`);
  revalidatePath(`/supplier-procurement/soa/reconcile/${reconId}/voucher`);
  revalidatePath("/supplier-procurement/soa/reconcile");
  revalidatePath("/finance/supplier-payment");
};

/**
 * Opens the payment voucher draft of an approved reconciliation. One open draft per reconciliation; and not while a PV of the same supplier
 * and month is still unpaid in Admin & Finance → Supplier Payment (that would be a second, competing voucher).
 */
export async function createPvDraft(reconciliationId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: recon } = await supabase.from("supplier_soa_reconciliations").select("id, company_id, supplier_id, period_start, status, suppliers(name)").eq("id", reconciliationId).maybeSingle();
    if (!recon) throw new Error("Reconciliation not found.");
    await requireManage(supabase, recon.company_id);
    if (recon.status !== "approved_for_payment") throw new Error("A payment voucher can be prepared only after the reconciliation is completed and approved for payment.");
    const { data: open } = await supabase.from("supplier_pv_drafts").select("id").eq("reconciliation_id", reconciliationId).in("status", ["draft", "submitted", "approved"]);
    if ((open ?? []).length > 0) return { id: open![0].id };
    const periodMonth = `${recon.period_start.slice(0, 7)}-01`;
    const supplierName = (recon.suppliers as unknown as { name: string } | null)?.name ?? "";
    const { data: pending } = await supabase.from("finance_payments").select("voucher_number, payee_name, status").eq("company_id", recon.company_id).eq("category", "supplier").eq("period_month", periodMonth).in("status", ["pending", "in_progress"]);
    const clash = (pending ?? []).find((p) => nameKey(p.payee_name) === nameKey(supplierName));
    if (clash) throw new Error(`${clash.voucher_number || "A payment voucher"} for ${supplierName} (${monthLabel(periodMonth)}) is still unpaid in Admin & Finance → Supplier Payment. Pay or cancel it there first, so the supplier is not paid twice.`);
    const { data, error } = await supabase.from("supplier_pv_drafts").insert({ company_id: recon.company_id, supplier_id: recon.supplier_id, reconciliation_id: reconciliationId, period_month: periodMonth }).select("id").single();
    if (error) throw error;
    await auditDraft(recon.company_id, data.id, "pv_draft_created", `${supplierName} · ${monthLabel(periodMonth)} · from SOA reconciliation`);
    paths(reconciliationId);
    return { id: data.id };
  }, "Could not open the payment voucher draft. Please try again.");
}

export type AllocationInput = { invoiceId: string; amount: number; overReason?: string };

/**
 * The invoices this voucher pays and how much of each (part payments allowed, one payment over several invoices). An amount above the
 * invoice's outstanding balance needs the Director of Finance / her PA and a reason (logged); the database refuses double allocation.
 */
export async function saveAllocations(draftId: string, allocations: AllocationInput[], remarks: string): Promise<ActionResult<{ total: number }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const draft = await loadDraft(supabase, draftId);
    await requireManage(supabase, draft.company_id);
    if (draft.status !== "draft") throw new Error("Only a draft can be changed. A submitted voucher must be rejected first.");
    const clean = allocations.map((a) => ({ ...a, amount: r2(Number(a.amount)) })).filter((a) => a.amount > 0);
    if (new Set(clean.map((a) => a.invoiceId)).size !== clean.length) throw new Error("The same invoice is listed twice.");
    const { data: supplier } = await supabase.from("suppliers").select("name").eq("id", draft.supplier_id).maybeSingle();
    const outstanding = await loadOutstandingInvoices(supabase, { companyId: draft.company_id, supplierId: draft.supplier_id, supplierName: supplier?.name ?? "", excludeDraftId: draftId, soaInvoiceIds: new Set() });
    const byId = new Map(outstanding.map((o) => [o.id, o]));
    const approver = await isApprover(supabase);
    const rows = clean.map((a) => {
      const inv = byId.get(a.invoiceId);
      if (!inv) throw new Error("One of the invoices is not an outstanding invoice of this supplier in this company.");
      const over = a.amount > inv.outstanding + 0.004;
      if (over) {
        if (!a.overReason?.trim()) throw new Error(`RM ${a.amount.toFixed(2)} is more than the RM ${inv.outstanding.toFixed(2)} left on invoice ${inv.number}. Lower it, or write the reason for paying more.`);
        if (!approver) throw new Error(`Paying more than the balance of invoice ${inv.number} needs the Director of Finance or her PA.`);
      }
      return {
        pv_draft_id: draftId,
        company_id: draft.company_id,
        supplier_invoice_id: a.invoiceId,
        invoice_amount: inv.amount,
        outstanding_at_draft: inv.outstanding,
        amount: a.amount,
        over_authorised: over,
        over_reason: over ? a.overReason!.trim().slice(0, 500) : null,
        over_authorised_by: over ? userId : null,
        over_authorised_at: over ? new Date().toISOString() : null,
        number: inv.number,
      };
    });
    const { data: before } = await supabase.from("supplier_pv_allocations").select("amount, supplier_invoices(invoice_number)").eq("pv_draft_id", draftId);
    const { error: delErr } = await supabase.from("supplier_pv_allocations").delete().eq("pv_draft_id", draftId);
    if (delErr) throw delErr;
    if (rows.length > 0) {
      const { error } = await supabase.from("supplier_pv_allocations").insert(rows.map((row) => { const { number, ...r } = row; void number; return r; }));
      if (error) throw new Error(error.message.includes("left to pay") ? error.message : "Could not save the invoices of this voucher.");
    }
    const total = r2(rows.reduce((t, r) => t + r.amount, 0));
    const { error: upErr } = await supabase.from("supplier_pv_drafts").update({ total, remarks: remarks.trim().slice(0, 1000) || null }).eq("id", draftId);
    if (upErr) throw upErr;
    const fmt = (list: { number: string; amount: number }[]) => list.map((r) => `${r.number} ${r.amount.toFixed(2)}`).join("; ").slice(0, 900);
    await auditDraft(
      draft.company_id,
      draftId,
      "pv_allocations_saved",
      `RM ${total.toFixed(2)} · ${fmt(rows)}${rows.some((r) => r.over_authorised) ? ` · over balance authorised: ${rows.filter((r) => r.over_authorised).map((r) => `${r.number} (${r.over_reason})`).join("; ")}` : ""}`,
      (before ?? []).length ? fmt((before ?? []).map((b) => ({ number: (b.supplier_invoices as unknown as { invoice_number: string } | null)?.invoice_number ?? "", amount: Number(b.amount) }))) : undefined,
    );
    paths(draft.reconciliation_id);
    return { total };
  }, "Could not save the voucher. Please try again.");
}

export async function submitPvDraft(draftId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const draft = await loadDraft(supabase, draftId);
    await requireManage(supabase, draft.company_id);
    if (draft.status !== "draft") throw new Error("Only a draft can be submitted.");
    if (Number(draft.total) <= 0) throw new Error("Select at least one invoice and the amount to pay.");
    const { error } = await supabase.from("supplier_pv_drafts").update({ status: "submitted", submitted_by: userId, submitted_at: new Date().toISOString() }).eq("id", draftId);
    if (error) throw error;
    await auditDraft(draft.company_id, draftId, "pv_submitted", `Submitted for approval · RM ${Number(draft.total).toFixed(2)}`);
    paths(draft.reconciliation_id);
    return {};
  }, "Could not submit. Please try again.");
}

/**
 * Finance approves: the voucher gets the next number of the existing PV numbering (PV-YYYYMM-NNN of the month) and goes into
 * Admin & Finance → Supplier Payment as an unpaid supplier payment. The invoices are NOT paid yet.
 */
export async function approvePvDraft(draftId: string): Promise<ActionResult<{ voucherNumber: string }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    await requireApprover(supabase);
    const draft = await loadDraft(supabase, draftId);
    if (draft.status !== "submitted") throw new Error("Only a submitted voucher can be approved.");
    const [{ data: supplier }, { data: allocs }, { data: recon }] = await Promise.all([
      supabase.from("suppliers").select("name").eq("id", draft.supplier_id).maybeSingle(),
      supabase.from("supplier_pv_allocations").select("amount, supplier_invoices(invoice_number)").eq("pv_draft_id", draftId),
      supabase.from("supplier_soa_reconciliations").select("id, status, period_start, period_end").eq("id", draft.reconciliation_id).maybeSingle(),
    ]);
    if (!supplier || !recon) throw new Error("The supplier or the reconciliation of this voucher was not found.");
    if (recon.status !== "approved_for_payment") throw new Error("The reconciliation of this voucher is no longer approved for payment.");
    const total = r2((allocs ?? []).reduce((t, a) => t + Number(a.amount), 0));
    if (total <= 0) throw new Error("This voucher has no invoice to pay.");

    const { data: accounts } = await supabase.from("payment_accounts").select("id, name, bank_name, account_no").eq("company_id", draft.company_id).eq("category", "supplier").eq("is_active", true);
    const account = (accounts ?? []).find((a) => nameKey(a.name) === nameKey(supplier.name));
    const prefix = `PV-${draft.period_month.slice(0, 4)}${draft.period_month.slice(5, 7)}-`;
    const lines = (allocs ?? []).map((a) => `${(a.supplier_invoices as unknown as { invoice_number: string } | null)?.invoice_number ?? ""} ${Number(a.amount).toFixed(2)}`).join("; ");
    let created: { id: string; voucher: string } | null = null;
    // the same running number as the monthly vouchers; tried again if another voucher took the number at the same moment
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const { data: used } = await supabase.from("finance_payments").select("voucher_number").eq("company_id", draft.company_id).like("voucher_number", `${prefix}%`);
      const next = (used ?? []).reduce((max, v) => Math.max(max, Number(v.voucher_number?.slice(prefix.length)) || 0), 0) + 1;
      const voucher = `${prefix}${String(next).padStart(3, "0")}`;
      const { data: clash } = await supabase.from("finance_payments").select("id").eq("company_id", draft.company_id).eq("voucher_number", voucher);
      if ((clash ?? []).length > 0) continue;
      const { data, error } = await supabase
        .from("finance_payments")
        .insert({
          company_id: draft.company_id,
          category: "supplier",
          account_id: account?.id ?? null,
          payee_name: supplier.name,
          bank_name: account?.bank_name ?? null,
          account_no: account?.account_no ?? null,
          payment_of: `Invoices per SOA ${recon.period_start} to ${recon.period_end} (reconciled)`,
          period_month: draft.period_month,
          amount: total,
          voucher_number: voucher,
          remarks: `From SOA reconciliation · ${lines}`.slice(0, 480),
          approved_by: userId,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      created = { id: data.id, voucher };
    }
    if (!created) throw new Error("Could not give the voucher a number. Please try again.");
    const now = new Date().toISOString();
    const { error: dErr } = await supabase.from("supplier_pv_drafts").update({ status: "approved", approved_by: userId, approved_at: now, voucher_number: created.voucher, finance_payment_id: created.id, total }).eq("id", draftId);
    if (dErr) throw dErr;
    const { error: rErr } = await supabase.from("supplier_soa_reconciliations").update({ status: "pv_issued" }).eq("id", recon.id);
    if (rErr) throw rErr;
    await auditDraft(draft.company_id, draftId, "pv_approved", `${created.voucher} · RM ${total.toFixed(2)} · ${lines}`.slice(0, 1000));
    await auditRecon(draft.company_id, recon.id, "pv_issued", `${created.voucher} · RM ${total.toFixed(2)}`, recon.status);
    await logTaskAudit({ companyId: draft.company_id, relatedTable: "finance_payments", relatedId: created.id, action: "payment_created", newValue: `${supplier.name} · RM ${total.toFixed(2)} · payment voucher ${created.voucher} (from SOA reconciliation)` });
    paths(draft.reconciliation_id);
    return { voucherNumber: created.voucher };
  }, "Could not approve the voucher. Please try again.");
}

export async function rejectPvDraft(draftId: string, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    await requireApprover(supabase);
    const draft = await loadDraft(supabase, draftId);
    if (draft.status !== "submitted") throw new Error("Only a submitted voucher can be rejected.");
    if (note.trim().length < 3) throw new Error("Write why the voucher is rejected.");
    // back to a draft so it can be corrected and submitted again
    const { error } = await supabase.from("supplier_pv_drafts").update({ status: "draft", rejected_by: userId, rejected_at: new Date().toISOString(), rejection_note: note.trim().slice(0, 1000), submitted_by: null, submitted_at: null }).eq("id", draftId);
    if (error) throw error;
    await auditDraft(draft.company_id, draftId, "pv_rejected", undefined, "submitted", note.trim().slice(0, 300));
    paths(draft.reconciliation_id);
    return {};
  }, "Could not reject. Please try again.");
}

/** A draft (or submitted) voucher no longer needed; or an approved voucher not paid yet, voided by Finance (its PV is cancelled). */
export async function cancelPvDraft(draftId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const draft = await loadDraft(supabase, draftId);
    if (reason.trim().length < 3) throw new Error("Write why the voucher is cancelled.");
    if (draft.status === "approved") {
      await requireApprover(supabase);
      if (draft.finance_payment_id) {
        const { data: fp } = await supabase.from("finance_payments").select("status").eq("id", draft.finance_payment_id).maybeSingle();
        const { data: parts } = await supabase.from("supplier_payments").select("id").eq("finance_payment_id", draft.finance_payment_id).eq("status", "paid");
        if (fp?.status === "paid" || (parts ?? []).length > 0) throw new Error("This voucher is already (partly) paid; it cannot be cancelled here.");
        const { error: fe } = await supabase.from("finance_payments").update({ status: "cancelled" }).eq("id", draft.finance_payment_id);
        if (fe) throw fe;
        await logTaskAudit({ companyId: draft.company_id, relatedTable: "finance_payments", relatedId: draft.finance_payment_id, action: "payment_cancelled", newValue: "cancelled", reason: `PV ${draft.voucher_number} voided from the SOA reconciliation: ${reason.trim().slice(0, 200)}` });
      }
      await supabase.from("supplier_soa_reconciliations").update({ status: "approved_for_payment" }).eq("id", draft.reconciliation_id);
    } else if (["draft", "submitted"].includes(draft.status)) {
      await requireManage(supabase, draft.company_id);
    } else throw new Error("This voucher cannot be cancelled.");
    const { error } = await supabase.from("supplier_pv_drafts").update({ status: "cancelled" }).eq("id", draftId);
    if (error) throw error;
    await auditDraft(draft.company_id, draftId, "pv_cancelled", undefined, draft.status, reason.trim().slice(0, 300));
    paths(draft.reconciliation_id);
    return {};
  }, "Could not cancel the voucher. Please try again.");
}

/**
 * The payment is made: the actual date, the bank reference and the proof. Only now are the invoices paid: one payment per invoice as
 * allocated, the PV marked paid in Admin & Finance (or, when it was already marked paid there, its date and reference are used).
 */
export async function recordPvPayment(draftId: string, input: { paidDate: string; reference: string; proofDocumentId?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const draft = await loadDraft(supabase, draftId);
    await requireManage(supabase, draft.company_id);
    if (draft.status !== "approved" || !draft.finance_payment_id) throw new Error("Only an approved voucher can be paid.");
    const { data: fp } = await supabase.from("finance_payments").select("id, status, paid_date, payment_reference, amount, paid_details_pending").eq("id", draft.finance_payment_id).maybeSingle();
    if (!fp) throw new Error("The payment voucher was not found in Admin & Finance.");
    if (fp.status === "cancelled") throw new Error("This payment voucher was cancelled in Admin & Finance.");
    const { data: parts } = await supabase.from("supplier_payments").select("id").eq("finance_payment_id", fp.id).eq("status", "paid");
    if ((parts ?? []).length > 0) throw new Error("Part payments were recorded on this voucher in Admin & Finance; record the rest there.");

    let paidDate = input.paidDate;
    let reference = input.reference.trim();
    if (fp.status === "paid" && !fp.paid_details_pending && fp.paid_date && fp.payment_reference) {
      paidDate = fp.paid_date;
      reference = fp.payment_reference;
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) throw new Error("Enter the actual payment date.");
      if (paidDate > todayInMalaysia()) throw new Error("The payment date cannot be in the future.");
      if (!reference) throw new Error("Enter the payment reference (bank / cheque no.).");
      const { error } = await supabase
        .from("finance_payments")
        .update({ status: "paid", paid_details_pending: false, paid_date: paidDate, payment_reference: reference, ...(input.proofDocumentId ? { proof_document_id: input.proofDocumentId } : {}) })
        .eq("id", fp.id);
      if (error) throw error;
      await logTaskAudit({ companyId: draft.company_id, relatedTable: "finance_payments", relatedId: fp.id, action: "payment_paid", previousValue: fp.status, newValue: `paid ${paidDate} · ref ${reference} (from the SOA reconciliation voucher)` });
    }

    const { data: allocs } = await supabase.from("supplier_pv_allocations").select("id, supplier_invoice_id, amount, supplier_payment_id, supplier_invoices(invoice_number, amount)").eq("pv_draft_id", draftId);
    for (const a of allocs ?? []) {
      if (a.supplier_payment_id) continue;
      const inv = a.supplier_invoices as unknown as { invoice_number: string; amount: number } | null;
      const { data: sp, error } = await supabase
        .from("supplier_payments")
        .insert({
          company_id: draft.company_id,
          supplier_invoice_id: a.supplier_invoice_id,
          amount: Number(a.amount),
          status: "paid",
          payment_date: paidDate,
          reference_number: `${draft.voucher_number} · ${reference}`.slice(0, 200),
          receipt_document_id: input.proofDocumentId ?? null,
          notes: `Allocated from payment voucher ${draft.voucher_number} (SOA reconciliation)`,
          requested_by: draft.prepared_by,
          confirmed_by: userId,
          confirmed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: ae } = await supabase.from("supplier_pv_allocations").update({ supplier_payment_id: sp.id }).eq("id", a.id);
      if (ae) throw ae;
      const { data: paidRows } = await supabase.from("supplier_payments").select("amount").eq("supplier_invoice_id", a.supplier_invoice_id).eq("status", "paid");
      const paidTotal = (paidRows ?? []).reduce((t, p) => t + Number(p.amount), 0);
      const full = inv ? paidTotal >= Number(inv.amount) - 0.004 : false;
      await supabase.from("supplier_invoices").update({ status: full ? "paid" : "partially_paid" }).eq("id", a.supplier_invoice_id);
    }
    const now = new Date().toISOString();
    const { error: de } = await supabase.from("supplier_pv_drafts").update({ status: "paid", paid_date: paidDate, payment_reference: reference, paid_recorded_by: userId, paid_recorded_at: now }).eq("id", draftId);
    if (de) throw de;
    await supabase.from("supplier_soa_reconciliations").update({ status: "paid" }).eq("id", draft.reconciliation_id);
    await auditDraft(draft.company_id, draftId, "pv_paid", `${draft.voucher_number} paid ${paidDate} · ref ${reference} · ${(allocs ?? []).length} invoice(s) posted`);
    await auditRecon(draft.company_id, draft.reconciliation_id, "paid", `${draft.voucher_number} paid ${paidDate} · ref ${reference}`, "pv_issued");
    paths(draft.reconciliation_id);
    return {};
  }, "Could not record the payment. Please try again.");
}
