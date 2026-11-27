"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import type { Json } from "@/lib/supabase/types";
import {
  classifyLine,
  matchStatement,
  parseSoaAmount,
  parseSoaDate,
  signedAmount,
  supplierBalances,
  type OurRecord,
  type SoaLineInput,
  type SoaLineType,
} from "@/lib/procurement/soaMatch";
import { loadOurBalances, loadOurRecords } from "@/lib/procurement/soaReconcileData";

type DB = Awaited<ReturnType<typeof createClient>>;
const TABLE = "supplier_soa_reconciliations";
const OPEN_STATUSES = ["not_reconciled", "in_progress", "discrepancy_found"];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/** Finance / Admin of the company, or a supplier payment editor: may upload, match and prepare. */
async function requireManage(supabase: DB, companyId: string) {
  const { data } = await supabase.rpc("user_can_manage_payments", { target_company_id: companyId, target_category: "supplier" });
  if (data !== true) throw new Error("Only Finance / Admin (or the supplier payment editors) of this company can reconcile supplier statements.");
}

/** The Director of Finance and her PA (the payroll centre list) approve supplier payments. */
export async function canApproveSupplierPayments(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("user_can_approve_supplier_payments");
  return data === true;
}
async function requireApprover(supabase: DB) {
  const { data } = await supabase.rpc("user_can_approve_supplier_payments");
  if (data !== true) throw new Error("Only the Director of Finance (Ms. Penny Chan) and her PA (Ms. Nabilah) can approve this.");
}

async function loadRecon(supabase: DB, id: string) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Reconciliation not found.");
  return data;
}

const audit = (companyId: string, relatedId: string, action: string, newValue?: string, previousValue?: string, reason?: string) =>
  logTaskAudit({ companyId, relatedTable: TABLE, relatedId, action, newValue, previousValue, reason });

const paths = (id?: string) => {
  revalidatePath("/supplier-procurement/soa/reconcile");
  if (id) revalidatePath(`/supplier-procurement/soa/reconcile/${id}`);
};

/** Starts a reconciliation: the supplier's SOA file (already uploaded to documents) for one company, supplier and period. */
export async function createReconciliation(input: { companyId: string; supplierId: string; periodStart: string; periodEnd: string; documentId: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    await requireManage(supabase, input.companyId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd) || input.periodEnd < input.periodStart) throw new Error("Choose the SOA period (from and to).");
    const [{ data: supplier }, { data: doc }] = await Promise.all([
      supabase.from("suppliers").select("id, company_id, name").eq("id", input.supplierId).maybeSingle(),
      supabase.from("documents").select("id, company_id, original_filename").eq("id", input.documentId).maybeSingle(),
    ]);
    if (!supplier || supplier.company_id !== input.companyId) throw new Error("Choose a supplier of this company.");
    if (!doc || doc.company_id !== input.companyId) throw new Error("The SOA file was not saved. Upload it again.");
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ company_id: input.companyId, supplier_id: input.supplierId, period_start: input.periodStart, period_end: input.periodEnd, soa_document_id: input.documentId })
      .select("id")
      .single();
    if (error) throw error;
    await supabase.from("documents").update({ related_table: TABLE, related_id: data.id }).eq("id", input.documentId);
    await audit(input.companyId, data.id, "soa_uploaded", `${supplier.name} · ${input.periodStart} to ${input.periodEnd} · file ${doc.original_filename}`);
    paths(data.id);
    return { id: data.id };
  }, "Could not start the reconciliation. Please try again.");
}

type ExtractedItem = Record<string, unknown>;

/** The statement lines from what the AI reader returned (or a person keyed in): dates and amounts in any printed format. */
function toLines(items: ExtractedItem[]): SoaLineInput[] {
  return items
    .map((it, i): SoaLineInput | null => {
      const debit = parseSoaAmount(it.debit);
      const credit = parseSoaAmount(it.credit);
      const single = parseSoaAmount(it.amount);
      const reference = it.reference ? String(it.reference).trim().slice(0, 120) : null;
      const description = it.description ? String(it.description).trim().slice(0, 300) : null;
      const type = classifyLine(it.type ? String(it.type) : null, `${reference ?? ""} ${description ?? ""}`, debit, credit);
      const balance = parseSoaAmount(it.balance);
      if (debit === null && credit === null && single === null && balance === null && !reference) return null;
      const amount = type === "opening" ? (balance ?? single ?? (debit ?? 0) - (credit ?? 0)) : signedAmount(type, debit, credit, single);
      const dateText = it.date === null || it.date === undefined ? null : String(it.date).slice(0, 40);
      return { lineNo: i + 1, date: parseSoaDate(it.date), dateText, type, reference, description, debit, credit, amount: r2(amount), balance, page: it.page !== undefined && it.page !== null ? String(it.page).slice(0, 20) : null };
    })
    .filter((x): x is SoaLineInput => x !== null)
    .map((l, i) => ({ ...l, lineNo: i + 1 }));
}

/**
 * Saves the statement as read (replacing an earlier reading of the same file), then matches it. The uploaded file itself is never changed.
 */
export async function saveStatementLines(
  id: string,
  input: { items: ExtractedItem[]; openingBalance?: unknown; closingBalance?: unknown; statementDate?: unknown; source: "extracted" | "manual" | "failed"; note?: string },
): Promise<ActionResult<{ lines: number }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const recon = await loadRecon(supabase, id);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("This reconciliation is already completed; reopen it before reading the statement again.");
    const lines = toLines(Array.isArray(input.items) ? input.items.slice(0, 2000) : []);
    const { error: delErr } = await supabase.from("supplier_soa_recon_lines").delete().eq("reconciliation_id", id);
    if (delErr) throw delErr;
    if (lines.length > 0) {
      const { error } = await supabase.from("supplier_soa_recon_lines").insert(
        lines.map((l) => ({
          reconciliation_id: id,
          company_id: recon.company_id,
          source: "supplier",
          line_no: l.lineNo,
          line_date: l.date,
          date_text: l.dateText,
          line_type: l.type,
          reference: l.reference,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
          amount: l.amount,
          balance: l.balance,
          page: l.page,
        })),
      );
      if (error) throw error;
    }
    const opening = parseSoaAmount(input.openingBalance);
    const closing = parseSoaAmount(input.closingBalance);
    const sup = supplierBalances(lines, { opening, closing });
    const { error: upErr } = await supabase
      .from(TABLE)
      .update({
        extraction_status: input.source,
        extraction_note: input.note?.slice(0, 1000) ?? null,
        soa_statement_date: parseSoaDate(input.statementDate),
        supplier_stated_opening: opening,
        supplier_stated_closing: closing,
        status: "in_progress",
      })
      .eq("id", id);
    if (upErr) throw upErr;
    await audit(recon.company_id, id, "soa_read", `${lines.length} line(s) ${input.source === "extracted" ? "read by the AI reader" : input.source === "manual" ? "keyed in" : "(reading failed)"} · supplier closing RM ${sup.closing.toFixed(2)}`);
    await rematch(supabase, id);
    paths(id);
    return { lines: lines.length };
  }, "Could not save the statement lines. Please try again.");
}

/**
 * Matches the statement with our records again. A match a person confirmed, and every resolution written, are kept; the rest is
 * worked out afresh. Updates the balances of both sides and the status (Discrepancy Found while anything is open).
 */
async function rematch(supabase: DB, id: string) {
  const recon = await loadRecon(supabase, id);
  const [{ data: rows, error }, ours, ourBal] = await Promise.all([
    supabase.from("supplier_soa_recon_lines").select("*").eq("reconciliation_id", id).order("line_no"),
    loadOurRecords(supabase, recon.company_id, recon.supplier_id, recon.period_start, recon.period_end),
    loadOurBalances(supabase, recon.company_id, recon.supplier_id, recon.period_start, recon.period_end),
  ]);
  if (error) throw error;
  const supplierRows = (rows ?? []).filter((r) => r.source === "supplier");
  const oursRows = (rows ?? []).filter((r) => r.source === "ours");
  const keptResolution = new Map(oursRows.filter((r) => r.resolution).map((r) => [r.matched_id, { resolution: r.resolution, by: r.resolved_by, at: r.resolved_at }]));

  const confirmed = supplierRows.filter((r) => r.match_confirmed && r.matched_id);
  const confirmedIds = new Set(confirmed.map((r) => r.matched_id as string));
  const free = supplierRows.filter((r) => !(r.match_confirmed && r.matched_id));
  const asInput = (r: (typeof supplierRows)[number]): SoaLineInput => ({
    lineNo: r.line_no ?? 0,
    date: r.line_date,
    dateText: r.date_text,
    type: r.line_type as SoaLineType,
    reference: r.reference,
    description: r.description,
    debit: r.debit === null ? null : Number(r.debit),
    credit: r.credit === null ? null : Number(r.credit),
    amount: Number(r.amount),
    balance: r.balance === null ? null : Number(r.balance),
    page: r.page,
  });
  const result = matchStatement({ lines: free.map(asInput), ours: ours.filter((o) => !confirmedIds.has(o.id)), periodStart: recon.period_start, periodEnd: recon.period_end });

  for (let i = 0; i < free.length; i++) {
    const m = result.lines[i];
    const row = free[i];
    const { error: e } = await supabase
      .from("supplier_soa_recon_lines")
      .update({
        status: m.status,
        match_method: m.method,
        match_confirmed: false,
        matched_table: m.record?.table ?? null,
        matched_id: m.record?.id ?? null,
        matched_ref: m.record?.ref ?? null,
        matched_date: m.record?.date ?? null,
        matched_amount: m.record?.amount ?? null,
        suggestions: m.suggestions as unknown as Json,
        likely_cause: m.likelyCause,
      })
      .eq("id", row.id);
    if (e) throw e;
  }
  // our records the statement does not show
  const { error: d2 } = await supabase.from("supplier_soa_recon_lines").delete().eq("reconciliation_id", id).eq("source", "ours");
  if (d2) throw d2;
  if (result.oursLeft.length > 0) {
    const { error: e3 } = await supabase.from("supplier_soa_recon_lines").insert(
      result.oursLeft.map((o, i) => {
        const kept = keptResolution.get(o.record.id);
        return {
          reconciliation_id: id,
          company_id: recon.company_id,
          source: "ours",
          line_no: i + 1,
          line_date: o.record.date,
          line_type: o.record.kind,
          reference: o.record.ref,
          description: o.record.table === "finance_payments" ? "Payment voucher (Admin & Finance)" : o.record.table === "supplier_payments" ? "Payment recorded" : o.record.table === "supplier_notes" ? "Credit / debit note" : "Invoice keyed in",
          amount: o.record.kind === "invoice" || o.record.kind === "debit_note" ? o.record.amount : -o.record.amount,
          status: o.status,
          matched_table: o.record.table,
          matched_id: o.record.id,
          matched_ref: o.record.ref,
          matched_date: o.record.date,
          matched_amount: o.record.amount,
          likely_cause: o.likelyCause,
          resolution: kept?.resolution ?? null,
          resolved_by: kept?.by ?? null,
          resolved_at: kept?.at ?? null,
        };
      }),
    );
    if (e3) throw e3;
  }

  // balances: the supplier's from the statement, ours from the ledger
  const allSupplierLines = supplierRows.map(asInput);
  const sup = supplierBalances(allSupplierLines, {
    opening: recon.supplier_stated_opening === null ? null : Number(recon.supplier_stated_opening),
    closing: recon.supplier_stated_closing === null ? null : Number(recon.supplier_stated_closing),
  });
  const difference = r2(sup.closing - ourBal.closing);

  const { data: fresh } = await supabase.from("supplier_soa_recon_lines").select("status, resolution, line_type").eq("reconciliation_id", id);
  const open = (fresh ?? []).filter((l) => l.line_type !== "opening" && l.status !== "matched" && !l.resolution).length;
  const status = open > 0 || Math.abs(difference) >= 0.01 ? "discrepancy_found" : "in_progress";
  const { error: e4 } = await supabase
    .from(TABLE)
    .update({
      supplier_opening: sup.opening,
      supplier_invoices: sup.invoices,
      supplier_payments: sup.payments,
      supplier_credit_notes: sup.creditNotes,
      supplier_debit_notes: sup.debitNotes,
      supplier_closing: sup.closing,
      our_opening: ourBal.opening,
      our_invoices: ourBal.invoices,
      our_payments: ourBal.payments,
      our_credit_notes: ourBal.creditNotes,
      our_debit_notes: ourBal.debitNotes,
      our_closing: ourBal.closing,
      difference,
      ...(OPEN_STATUSES.includes(recon.status) ? { status } : {}),
    })
    .eq("id", id);
  if (e4) throw e4;
}

export async function runMatching(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const recon = await loadRecon(supabase, id);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("This reconciliation is already completed; reopen it to match again.");
    await rematch(supabase, id);
    await audit(recon.company_id, id, "matching_run", "Matched again with our records");
    paths(id);
    return {};
  }, "Could not match the statement. Please try again.");
}

/** Links a statement line to one of our records: a suggestion confirmed, or a record picked by hand. Never changes our record. */
export async function confirmMatch(lineId: string, record: { table: OurRecord["table"]; id: string }, method: "fuzzy" | "manual"): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: line } = await supabase.from("supplier_soa_recon_lines").select("*").eq("id", lineId).maybeSingle();
    if (!line || line.source !== "supplier") throw new Error("Statement line not found.");
    const recon = await loadRecon(supabase, line.reconciliation_id);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("This reconciliation is already completed; reopen it to change a match.");
    const ours = await loadOurRecords(supabase, recon.company_id, recon.supplier_id, recon.period_start, recon.period_end);
    const target = ours.find((o) => o.id === record.id && o.table === record.table);
    if (!target) throw new Error("That record is not one of this supplier's records in this company.");
    const { data: taken } = await supabase.from("supplier_soa_recon_lines").select("line_no").eq("reconciliation_id", recon.id).eq("source", "supplier").eq("match_confirmed", true).eq("matched_id", target.id).neq("id", lineId);
    if ((taken ?? []).length > 0) throw new Error(`That record is already matched to statement line ${taken![0].line_no}.`);
    const same = Math.abs(Math.abs(Number(line.amount)) - target.amount) < 0.005;
    const { error } = await supabase
      .from("supplier_soa_recon_lines")
      .update({
        status: same ? "matched" : "amount_mismatch",
        match_method: method,
        match_confirmed: true,
        matched_table: target.table,
        matched_id: target.id,
        matched_ref: target.ref,
        matched_date: target.date,
        matched_amount: target.amount,
        likely_cause: same ? null : `Amount differs by RM ${Math.abs(Math.abs(Number(line.amount)) - target.amount).toFixed(2)}.`,
      })
      .eq("id", lineId);
    if (error) throw error;
    await audit(recon.company_id, recon.id, method === "fuzzy" ? "suggestion_confirmed" : "matched_by_hand", `Line ${line.line_no} ${line.reference ?? ""} ↔ ${target.ref} (RM ${target.amount.toFixed(2)})`);
    await rematch(supabase, recon.id);
    paths(recon.id);
    return {};
  }, "Could not confirm the match. Please try again.");
}

export async function undoMatch(lineId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: line } = await supabase.from("supplier_soa_recon_lines").select("*").eq("id", lineId).maybeSingle();
    if (!line) throw new Error("Statement line not found.");
    const recon = await loadRecon(supabase, line.reconciliation_id);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("This reconciliation is already completed.");
    const { error } = await supabase.from("supplier_soa_recon_lines").update({ match_confirmed: false, matched_id: null, matched_table: null }).eq("id", lineId);
    if (error) throw error;
    await audit(recon.company_id, recon.id, "match_undone", `Line ${line.line_no} ${line.reference ?? ""} (was ${line.matched_ref ?? "—"})`);
    await rematch(supabase, recon.id);
    paths(recon.id);
    return {};
  }, "Could not undo the match. Please try again.");
}

/** A discrepancy explained in writing (who, when, what): needed before the reconciliation can be completed. */
export async function resolveLine(lineId: string, resolution: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const text = resolution.trim();
    const { data: line } = await supabase.from("supplier_soa_recon_lines").select("*").eq("id", lineId).maybeSingle();
    if (!line) throw new Error("Line not found.");
    const recon = await loadRecon(supabase, line.reconciliation_id);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("This reconciliation is already completed.");
    const { error } = await supabase
      .from("supplier_soa_recon_lines")
      .update(text ? { resolution: text.slice(0, 1000), resolved_by: userId, resolved_at: new Date().toISOString() } : { resolution: null, resolved_by: null, resolved_at: null })
      .eq("id", lineId);
    if (error) throw error;
    await audit(recon.company_id, recon.id, text ? "discrepancy_resolved" : "resolution_removed", `${line.source === "ours" ? "Our record" : `Line ${line.line_no}`} ${line.reference ?? ""}: ${text || "—"}`, line.resolution ?? undefined);
    await rematch(supabase, recon.id);
    paths(recon.id);
    return {};
  }, "Could not save the resolution. Please try again.");
}

/** Adds a line the reader missed, or corrects how one line was read (the original file is kept as it is). */
export async function saveManualLine(
  reconciliationId: string,
  input: { lineId?: string; date: string; type: SoaLineType; reference: string; description?: string; amount: number; balance?: number | null },
): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const recon = await loadRecon(supabase, reconciliationId);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("This reconciliation is already completed.");
    const date = parseSoaDate(input.date);
    if (!date && input.type !== "opening") throw new Error("Enter the date of the line.");
    if (!Number.isFinite(input.amount)) throw new Error("Enter the amount of the line.");
    const amount = input.type === "opening" || input.type === "other" ? r2(input.amount) : signedAmount(input.type, null, null, input.amount);
    const fields = {
      line_date: date,
      date_text: input.date,
      line_type: input.type,
      reference: input.reference.trim() || null,
      description: input.description?.trim() || null,
      debit: amount > 0 ? Math.abs(amount) : null,
      credit: amount < 0 ? Math.abs(amount) : null,
      amount,
      balance: input.balance ?? null,
      match_confirmed: false,
      matched_id: null,
    };
    if (input.lineId) {
      const { data: before } = await supabase.from("supplier_soa_recon_lines").select("line_no, reference, amount, line_date").eq("id", input.lineId).eq("reconciliation_id", reconciliationId).maybeSingle();
      if (!before) throw new Error("Line not found.");
      const { error } = await supabase.from("supplier_soa_recon_lines").update(fields).eq("id", input.lineId);
      if (error) throw error;
      await audit(recon.company_id, recon.id, "line_corrected", `Line ${before.line_no}: ${fields.reference ?? ""} ${fields.line_date ?? ""} RM ${amount.toFixed(2)}`, `${before.reference ?? ""} ${before.line_date ?? ""} RM ${Number(before.amount).toFixed(2)}`);
    } else {
      const { data: last } = await supabase.from("supplier_soa_recon_lines").select("line_no").eq("reconciliation_id", reconciliationId).eq("source", "supplier").order("line_no", { ascending: false }).limit(1);
      const { error } = await supabase.from("supplier_soa_recon_lines").insert({ ...fields, reconciliation_id: reconciliationId, company_id: recon.company_id, source: "supplier", line_no: (last?.[0]?.line_no ?? 0) + 1 });
      if (error) throw error;
      await audit(recon.company_id, recon.id, "line_added", `${fields.reference ?? ""} ${fields.line_date ?? ""} RM ${amount.toFixed(2)}`);
    }
    await rematch(supabase, reconciliationId);
    paths(reconciliationId);
    return {};
  }, "Could not save the line. Please try again.");
}

export async function deleteStatementLine(lineId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: line } = await supabase.from("supplier_soa_recon_lines").select("*").eq("id", lineId).maybeSingle();
    if (!line || line.source !== "supplier") throw new Error("Statement line not found.");
    const recon = await loadRecon(supabase, line.reconciliation_id);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("This reconciliation is already completed.");
    const { error } = await supabase.from("supplier_soa_recon_lines").delete().eq("id", lineId);
    if (error) throw error;
    await audit(recon.company_id, recon.id, "line_removed", undefined, `Line ${line.line_no} ${line.reference ?? ""} ${line.line_date ?? ""} RM ${Number(line.amount).toFixed(2)} (a reading error)`);
    await rematch(supabase, recon.id);
    paths(recon.id);
    return {};
  }, "Could not remove the line. Please try again.");
}

/** The supplier's stated opening and closing balance (as printed on the statement), when the reader missed or misread them. */
export async function saveStatedBalances(id: string, input: { opening: number | null; closing: number | null }): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const recon = await loadRecon(supabase, id);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("This reconciliation is already completed.");
    const { error } = await supabase.from(TABLE).update({ supplier_stated_opening: input.opening, supplier_stated_closing: input.closing }).eq("id", id);
    if (error) throw error;
    await audit(recon.company_id, id, "stated_balances", `opening ${input.opening ?? "—"} · closing ${input.closing ?? "—"}`, `opening ${recon.supplier_stated_opening ?? "—"} · closing ${recon.supplier_stated_closing ?? "—"}`);
    await rematch(supabase, id);
    paths(id);
    return {};
  }, "Could not save the balances. Please try again.");
}

/**
 * Completes the reconciliation: every discrepancy must be matched or explained in writing, and the balances must agree (or the difference
 * be explained), unless Finance approved it as an exception.
 */
export async function completeReconciliation(id: string, remarks: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    await rematchIfOpen(supabase, id);
    const recon = await loadRecon(supabase, id);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("This reconciliation is already completed.");
    const { data: lines } = await supabase.from("supplier_soa_recon_lines").select("status, resolution, line_type, source").eq("reconciliation_id", id);
    if ((lines ?? []).filter((l) => l.source === "supplier").length === 0) throw new Error("Read or key in the statement lines first.");
    const open = (lines ?? []).filter((l) => l.line_type !== "opening" && l.status !== "matched" && !l.resolution).length;
    const diff = Number(recon.difference ?? 0);
    const exception = !!recon.exception_approved_by;
    if ((open > 0 || Math.abs(diff) >= 0.01) && !exception) {
      await supabase.from(TABLE).update({ status: "discrepancy_found" }).eq("id", id);
      paths(id);
      throw new Error(
        open > 0
          ? `${open} line(s) are still open. Match them, or write how each discrepancy is resolved, or ask Finance for an exception approval.`
          : `The balances still differ by RM ${diff.toFixed(2)}. Explain it on the lines, or ask Finance for an exception approval.`,
      );
    }
    const { error } = await supabase.from(TABLE).update({ status: "reconciled", reconciled_by: userId, reconciled_at: new Date().toISOString(), remarks: remarks.trim().slice(0, 2000) || recon.remarks }).eq("id", id);
    if (error) throw error;
    await audit(recon.company_id, id, "reconciled", `Reconciled · difference RM ${diff.toFixed(2)}${exception ? " · with exception approval" : ""}`, recon.status);
    paths(id);
    return {};
  }, "Could not complete the reconciliation. Please try again.");
}

async function rematchIfOpen(supabase: DB, id: string) {
  const recon = await loadRecon(supabase, id);
  if (OPEN_STATUSES.includes(recon.status)) await rematch(supabase, id);
}

/** The verification officer checks the completed reconciliation. */
export async function verifyReconciliation(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const recon = await loadRecon(supabase, id);
    const { data: canApprove } = await supabase.rpc("user_can_approve_supplier_payments");
    if (canApprove !== true) await requireManage(supabase, recon.company_id);
    if (recon.status !== "reconciled") throw new Error("Only a completed (Reconciled) reconciliation can be verified.");
    const { error } = await supabase.from(TABLE).update({ verified_by: userId, verified_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await audit(recon.company_id, id, "verified", "Reconciliation verified");
    paths(id);
    return {};
  }, "Could not verify. Please try again.");
}

/** Finance approval: the supplier may be paid. Only after the reconciliation is completed and verified. */
export async function approveForPayment(id: string, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    await requireApprover(supabase);
    const recon = await loadRecon(supabase, id);
    if (recon.status !== "reconciled") throw new Error("The reconciliation must be completed (Reconciled) first.");
    if (!recon.verified_by) throw new Error("The reconciliation must be verified first.");
    const { error } = await supabase.from(TABLE).update({ status: "approved_for_payment", approved_by: userId, approved_at: new Date().toISOString(), approval_note: note.trim().slice(0, 1000) || null }).eq("id", id);
    if (error) throw error;
    await audit(recon.company_id, id, "approved_for_payment", `Approved for payment${note.trim() ? ` · ${note.trim().slice(0, 200)}` : ""}`, recon.status);
    paths(id);
    return {};
  }, "Could not approve. Please try again.");
}

/** Finance accepts the open discrepancies as an exception (with the reason): the reconciliation can then be completed. */
export async function approveException(id: string, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    await requireApprover(supabase);
    const recon = await loadRecon(supabase, id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("Only an open reconciliation needs an exception.");
    if (note.trim().length < 5) throw new Error("Write the reason for the exception.");
    const { error } = await supabase.from(TABLE).update({ exception_approved_by: userId, exception_approved_at: new Date().toISOString(), exception_note: note.trim().slice(0, 1000) }).eq("id", id);
    if (error) throw error;
    await audit(recon.company_id, id, "exception_approved", note.trim().slice(0, 300));
    paths(id);
    return {};
  }, "Could not approve the exception. Please try again.");
}

/** Sends a completed reconciliation back for more work (before any PV is issued); the approvals given are cleared. */
export async function reopenReconciliation(id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const recon = await loadRecon(supabase, id);
    const { data: canApprove } = await supabase.rpc("user_can_approve_supplier_payments");
    if (canApprove !== true) await requireManage(supabase, recon.company_id);
    if (!["reconciled", "approved_for_payment"].includes(recon.status)) throw new Error("Only a completed reconciliation without a payment voucher can be reopened.");
    if (recon.status === "approved_for_payment" && canApprove !== true) throw new Error("Only Finance can reopen an approved reconciliation.");
    const { data: drafts } = await supabase.from("supplier_pv_drafts").select("id").eq("reconciliation_id", id).in("status", ["draft", "submitted", "approved"]);
    if ((drafts ?? []).length > 0) throw new Error("A payment voucher is being prepared from this reconciliation; cancel it first.");
    if (reason.trim().length < 3) throw new Error("Write why it is reopened.");
    const { error } = await supabase.from(TABLE).update({ status: "in_progress", reconciled_by: null, reconciled_at: null, verified_by: null, verified_at: null, approved_by: null, approved_at: null }).eq("id", id);
    if (error) throw error;
    await audit(recon.company_id, id, "reopened", undefined, recon.status, reason.trim().slice(0, 300));
    await rematch(supabase, id);
    paths(id);
    return {};
  }, "Could not reopen. Please try again.");
}

export async function cancelReconciliation(id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const recon = await loadRecon(supabase, id);
    await requireManage(supabase, recon.company_id);
    if (!OPEN_STATUSES.includes(recon.status)) throw new Error("Only an open reconciliation can be cancelled.");
    if (reason.trim().length < 3) throw new Error("Write why it is cancelled.");
    const { error } = await supabase.from(TABLE).update({ status: "cancelled" }).eq("id", id);
    if (error) throw error;
    await audit(recon.company_id, id, "cancelled", undefined, recon.status, reason.trim().slice(0, 300));
    paths(id);
    return {};
  }, "Could not cancel. Please try again.");
}

/** A supporting document (the supplier's reply, a proof of payment, an invoice copy) kept with the reconciliation. */
export async function attachSupportingDocument(id: string, documentId: string, label: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const recon = await loadRecon(supabase, id);
    await requireManage(supabase, recon.company_id);
    const { data: doc } = await supabase.from("documents").select("id, company_id, original_filename").eq("id", documentId).maybeSingle();
    if (!doc || doc.company_id !== recon.company_id) throw new Error("The file was not saved. Upload it again.");
    const { error } = await supabase.from("documents").update({ related_table: TABLE, related_id: id }).eq("id", documentId);
    if (error) throw error;
    await audit(recon.company_id, id, "document_attached", `${label.trim() || "Supporting document"} · ${doc.original_filename}`);
    paths(id);
    return {};
  }, "Could not attach the document. Please try again.");
}
