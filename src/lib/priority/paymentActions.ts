"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { confirmedPaymentDate, todayInMalaysia } from "@/lib/format";
import { requireApprover, requireCompanyAdmin } from "@/lib/priority/access";
import { loadPayables } from "@/lib/priority/queries";
import { OPS_ALERT_LABEL, PRIORITY_LABEL, round2, type OpsAlertType, type PayableType, type PriorityLevel } from "@/lib/priority/payables";

type DB = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

const TABLE: Record<PayableType, "finance_payments" | "supplier_invoices"> = { finance_payment: "finance_payments", supplier_invoice: "supplier_invoices" };

function refresh() {
  revalidatePath("/priority-centre");
  revalidatePath("/");
}

/** The payable with the Priority Centre rules applied, read fresh; throws when it does not exist or is not visible. */
async function payableOf(supabase: DB, type: PayableType, id: string) {
  const table = TABLE[type];
  const { data: base } = await supabase.from(table).select("company_id").eq("id", id).maybeSingle();
  if (!base) throw new Error("This payment record was not found.");
  await requireCompanyAdmin(supabase, base.company_id);
  const [view] = await loadPayables(supabase, [base.company_id], todayInMalaysia(), { type, id });
  if (!view) throw new Error("This payment record is not part of the supplier payments list.");
  return view;
}

async function audit(companyId: string, type: PayableType, id: string, action: string, newValue?: string, previousValue?: string, reason?: string) {
  await recordAudit({ companyId, relatedTable: TABLE[type], relatedId: id, action, newValue, previousValue, reason });
}

async function upsertControl(supabase: DB, companyId: string, type: PayableType, id: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from("supplier_payment_controls")
    .upsert({ company_id: companyId, payable_type: type, payable_id: id, ...patch }, { onConflict: "payable_type,payable_id" });
  if (error) throw error;
}

type Ref = { type: PayableType; id: string };

/** Step 2 of the workflow: Finance confirms the outstanding balance against the real invoice. Only a verified balance counts as confirmed. */
export async function verifyBalance(ref: Ref) {
  const { supabase, userId } = await requireUser();
  const p = await payableOf(supabase, ref.type, ref.id);
  if (p.outstanding <= 0) throw new Error("Nothing is outstanding on this record.");
  await upsertControl(supabase, p.companyId, p.type, p.id, { verified_amount: p.amount, verified_by: userId, verified_at: new Date().toISOString() });
  await audit(p.companyId, p.type, p.id, "balance_verified", `RM ${p.amount.toFixed(2)}`);
  refresh();
}

/** Step 3: Finance submits a payment request (the whole balance or part of it) for Madam Penny's review. Nothing is paid by this. */
export async function requestPayment(input: Ref & { amount: number; note?: string }) {
  const { supabase, userId } = await requireUser();
  const p = await payableOf(supabase, input.type, input.id);
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter the amount to request (more than 0).");
  if (p.verification !== "verified") throw new Error("Verify the outstanding balance first: a payment request can only be made for a verified balance.");
  if (p.control?.holdStatus || p.statusKey === "on_hold") throw new Error("This payable is on hold or disputed. Clear the hold before requesting a payment.");
  if (amount > p.requestable + 0.004) {
    throw new Error(p.requestable <= 0 ? "The whole outstanding balance is already in a payment request." : `You can request at most RM ${p.requestable.toFixed(2)} (the verified balance minus requests already open).`);
  }
  if (p.openRequests.some((l) => l.status === "pending" && Math.abs(l.amount - amount) < 0.005)) throw new Error("A request for the same amount is already waiting for approval.");

  const { data: payment, error } = await supabase
    .from("supplier_payments")
    .insert({
      company_id: p.companyId,
      amount,
      status: "pending",
      requested_by: userId,
      notes: input.note?.trim() || null,
      ...(p.type === "finance_payment" ? { finance_payment_id: p.id } : { supplier_invoice_id: p.id }),
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: approval, error: approvalError } = await supabase
    .from("approvals")
    .insert({ company_id: p.companyId, module: "finance-admin", related_table: "supplier_payments", related_id: payment.id, status: "pending", requested_by: userId })
    .select("id")
    .single();
  if (approvalError) throw approvalError;
  await supabase.from("supplier_payments").update({ approval_id: approval.id }).eq("id", payment.id);

  await recordAudit({ companyId: p.companyId, relatedTable: "supplier_payments", relatedId: payment.id, action: "payment_requested", newValue: `RM ${amount.toFixed(2)} · ${p.supplierName}${p.reference ? ` · ${p.reference}` : ""}` });
  await audit(p.companyId, p.type, p.id, "payment_requested", `RM ${amount.toFixed(2)}`);
  refresh();
}

async function loadRequest(supabase: DB, paymentId: string) {
  const { data } = await supabase.from("supplier_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!data) throw new Error("Payment request not found.");
  return data;
}

function payableRefOf(payment: { finance_payment_id: string | null; supplier_invoice_id: string | null }): Ref {
  return payment.finance_payment_id ? { type: "finance_payment", id: payment.finance_payment_id } : { type: "supplier_invoice", id: payment.supplier_invoice_id ?? "" };
}

/** Step 4: Madam Penny approves or rejects. Approval only releases the request to Finance: it never marks anything as paid. */
export async function decidePaymentRequest(input: { paymentId: string; decision: "approved" | "rejected"; note?: string }) {
  const { supabase, userId } = await requireUser();
  await requireApprover(supabase);
  const payment = await loadRequest(supabase, input.paymentId);
  if (payment.status !== "pending") throw new Error("This request has already been decided.");
  if (input.decision === "rejected" && !input.note?.trim()) throw new Error("Write the reason for rejecting this request.");
  const ref = payableRefOf(payment);
  const p = await payableOf(supabase, ref.type, ref.id);
  if (input.decision === "approved" && (p.statusKey === "on_hold" || p.control?.holdStatus)) throw new Error("This payable is on hold or disputed, so the request cannot be approved.");

  const { data: decided, error } = await supabase
    .from("supplier_payments")
    .update({ status: input.decision, decided_by: userId, decided_at: new Date().toISOString(), decision_note: input.note?.trim() || null })
    .eq("id", payment.id)
    .eq("status", "pending")
    .select("id");
  if (error) throw error;
  if (!decided || decided.length !== 1) throw new Error("This request was already decided by someone else. Refresh the page.");
  if (payment.approval_id) await supabase.from("approvals").update({ status: input.decision }).eq("id", payment.approval_id);

  await recordAudit({ companyId: payment.company_id, relatedTable: "supplier_payments", relatedId: payment.id, action: input.decision === "approved" ? "payment_approved" : "payment_rejected", newValue: `RM ${Number(payment.amount).toFixed(2)}`, reason: input.note?.trim() || undefined });
  await audit(p.companyId, p.type, p.id, input.decision === "approved" ? "payment_approved" : "payment_rejected", `RM ${Number(payment.amount).toFixed(2)}`, undefined, input.note?.trim() || undefined);
  refresh();
}

/** The requester can take back a request that is still waiting for a decision. */
export async function withdrawPaymentRequest(paymentId: string) {
  const { supabase, userId } = await requireUser();
  const payment = await loadRequest(supabase, paymentId);
  await requireCompanyAdmin(supabase, payment.company_id);
  if (payment.status !== "pending") throw new Error("Only a request that is still waiting for approval can be withdrawn.");
  const { error } = await supabase.from("supplier_payments").update({ status: "rejected", decided_by: userId, decided_at: new Date().toISOString(), decision_note: "Withdrawn by the requester" }).eq("id", paymentId).eq("status", "pending");
  if (error) throw error;
  if (payment.approval_id) await supabase.from("approvals").update({ status: "rejected" }).eq("id", payment.approval_id);
  await recordAudit({ companyId: payment.company_id, relatedTable: "supplier_payments", relatedId: paymentId, action: "request_withdrawn", newValue: `RM ${Number(payment.amount).toFixed(2)}` });
  refresh();
}

/** Step 5: Finance starts processing an approved request (the actual bank transfer is always done by a person, never by this system). */
export async function startPaymentProcessing(paymentId: string) {
  const { supabase, userId } = await requireUser();
  const payment = await loadRequest(supabase, paymentId);
  await requireCompanyAdmin(supabase, payment.company_id);
  if (payment.status !== "approved") throw new Error("Only an approved request can be moved to processing.");
  const { error } = await supabase.from("supplier_payments").update({ status: "processing", processing_by: userId, processing_at: new Date().toISOString() }).eq("id", paymentId).eq("status", "approved");
  if (error) throw error;
  await recordAudit({ companyId: payment.company_id, relatedTable: "supplier_payments", relatedId: paymentId, action: "payment_processing", newValue: `RM ${Number(payment.amount).toFixed(2)}` });
  refresh();
}

/**
 * Steps 6 and 7: Finance records the payment that has really been made (date, method, transaction reference). Only now does
 * the outstanding balance go down. The payable is marked paid only when confirmed payments cover its whole amount.
 */
export async function confirmPayment(input: { paymentId: string; paymentDate: string; paymentMethod: string; referenceNumber: string; receiptDocumentId?: string }) {
  const { supabase, userId } = await requireUser();
  const payment = await loadRequest(supabase, input.paymentId);
  await requireCompanyAdmin(supabase, payment.company_id);
  if (payment.status !== "approved" && payment.status !== "processing") throw new Error("Only a payment request that Madam Penny has approved can be confirmed as paid.");
  const reference = input.referenceNumber?.trim();
  if (!reference) throw new Error("Enter the transaction reference of the payment.");
  if (!input.paymentMethod?.trim()) throw new Error("Select how the payment was made.");
  const paymentDate = confirmedPaymentDate(input.paymentDate);

  const ref = payableRefOf(payment);
  const p = await payableOf(supabase, ref.type, ref.id);
  if (p.statusKey === "on_hold" || p.control?.holdStatus) throw new Error("This payable is on hold or disputed. Clear the hold before confirming a payment.");
  const amount = Number(payment.amount);
  if (p.paidAmount + amount > p.amount + 0.004) throw new Error("This payment would be more than the invoice amount. Check the amounts already paid.");

  // the same transaction reference, amount and date on another payable of the company is almost certainly a duplicate entry
  const { data: same } = await supabase
    .from("supplier_payments")
    .select("id, finance_payment_id, supplier_invoice_id")
    .eq("company_id", payment.company_id)
    .eq("status", "paid")
    .ilike("reference_number", reference)
    .eq("amount", amount)
    .eq("payment_date", paymentDate)
    .neq("id", payment.id);
  if ((same ?? []).length > 0) throw new Error("A payment with the same transaction reference, amount and date is already recorded. Check that this is not a duplicate entry.");

  const { data: updated, error } = await supabase
    .from("supplier_payments")
    .update({
      status: "paid",
      payment_date: paymentDate,
      payment_method: input.paymentMethod.trim(),
      reference_number: reference,
      receipt_document_id: input.receiptDocumentId || null,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .in("status", ["approved", "processing"])
    .select("id");
  if (error) {
    if (error.code === "23505") throw new Error("This transaction reference is already recorded against the same invoice (duplicate payment entry).");
    throw error;
  }
  if (!updated || updated.length !== 1) throw new Error("This payment was already confirmed or changed by someone else. Refresh the page.");

  const paidNow = round2(p.paidAmount + amount);
  const settled = paidNow >= p.amount - 0.004;
  if (settled) {
    const refs = [...p.ledger.filter((l) => l.status === "paid" && l.referenceNumber).map((l) => l.referenceNumber as string), reference].join(", ");
    if (p.type === "finance_payment") {
      const { error: fe } = await supabase
        .from("finance_payments")
        .update({ status: "paid", paid_details_pending: false, paid_date: paymentDate, payment_reference: refs, ...(input.receiptDocumentId ? { proof_document_id: input.receiptDocumentId } : {}) })
        .eq("id", p.id);
      if (fe) throw fe;
    } else {
      const { error: ie } = await supabase.from("supplier_invoices").update({ status: "paid" }).eq("id", p.id);
      if (ie) throw ie;
    }
  }

  await recordAudit({ companyId: payment.company_id, relatedTable: "supplier_payments", relatedId: payment.id, action: "payment_confirmed", newValue: `RM ${amount.toFixed(2)} on ${paymentDate} · ${input.paymentMethod.trim()} · ref ${reference}` });
  await audit(p.companyId, p.type, p.id, settled ? "payment_confirmed_settled" : "payment_confirmed_partial", `RM ${amount.toFixed(2)} on ${paymentDate} · ref ${reference}`, `outstanding RM ${p.outstanding.toFixed(2)}`);
  refresh();
  revalidatePath("/finance/payments");
  revalidatePath("/supplier-procurement/invoices");
}

/** Marks a payable urgent (or clears that); the reason is kept. */
export async function setUrgent(input: Ref & { urgent: boolean; reason?: string }) {
  const { supabase } = await requireUser();
  const p = await payableOf(supabase, input.type, input.id);
  if (input.urgent && !input.reason?.trim()) throw new Error("Write why this payment is urgent.");
  await upsertControl(supabase, p.companyId, p.type, p.id, { is_urgent: input.urgent, urgent_reason: input.urgent ? input.reason!.trim() : null });
  await audit(p.companyId, p.type, p.id, input.urgent ? "marked_urgent" : "urgent_cleared", undefined, undefined, input.reason?.trim());
  refresh();
}

/** Overrides the automatic priority; a reason is required. Passing null goes back to the automatic priority. */
export async function overridePriority(input: Ref & { priority: PriorityLevel | null; reason?: string }) {
  const { supabase, userId } = await requireUser();
  const p = await payableOf(supabase, input.type, input.id);
  if (input.priority && !input.reason?.trim()) throw new Error("Write the reason for changing the priority.");
  await upsertControl(supabase, p.companyId, p.type, p.id, {
    priority_override: input.priority,
    override_reason: input.priority ? input.reason!.trim() : null,
    override_by: input.priority ? userId : null,
    override_at: input.priority ? new Date().toISOString() : null,
  });
  await audit(p.companyId, p.type, p.id, input.priority ? "priority_overridden" : "priority_override_cleared", input.priority ? PRIORITY_LABEL[input.priority] : "automatic", p.priority ? PRIORITY_LABEL[p.priority] : undefined, input.reason?.trim());
  refresh();
}

/** Puts a payable on hold / marks it disputed (no payment can be requested or confirmed meanwhile), or clears that. */
export async function setHold(input: Ref & { status: "on_hold" | "disputed" | null; reason?: string }) {
  const { supabase, userId } = await requireUser();
  const p = await payableOf(supabase, input.type, input.id);
  if (input.status && !input.reason?.trim()) throw new Error("Write the reason for the hold or dispute.");
  if (input.status && p.openRequests.some((l) => l.status === "processing")) throw new Error("A payment is already being processed for this record.");
  await upsertControl(supabase, p.companyId, p.type, p.id, {
    hold_status: input.status,
    hold_reason: input.status ? input.reason!.trim() : null,
    hold_by: input.status ? userId : null,
    hold_at: input.status ? new Date().toISOString() : null,
  });
  await audit(p.companyId, p.type, p.id, input.status ? (input.status === "disputed" ? "marked_disputed" : "put_on_hold") : "hold_cleared", undefined, undefined, input.reason?.trim());
  refresh();
}

/**
 * An operational alert (supplier blocked, refuses orders, event affected) is only ever shown when an authorised person has
 * recorded it with a note: it is a manually verified update, never a guess.
 */
export async function setOperationalAlert(input: Ref & { alertType: OpsAlertType | null; note?: string; eventId?: string }) {
  const { supabase, userId } = await requireUser();
  const p = await payableOf(supabase, input.type, input.id);
  if (input.alertType && !input.note?.trim()) throw new Error("Write what was confirmed (who told you, and when).");
  await upsertControl(supabase, p.companyId, p.type, p.id, {
    ops_alert_type: input.alertType,
    ops_alert_note: input.alertType ? input.note!.trim() : null,
    ops_alert_event_id: input.alertType === "event_affected" && input.eventId ? input.eventId : null,
    ops_alert_by: input.alertType ? userId : null,
    ops_alert_at: input.alertType ? new Date().toISOString() : null,
  });
  await audit(p.companyId, p.type, p.id, input.alertType ? "operational_alert_recorded" : "operational_alert_cleared", input.alertType ? OPS_ALERT_LABEL[input.alertType] : undefined, undefined, input.note?.trim());
  refresh();
}

export async function saveControlNote(input: Ref & { note: string }) {
  const { supabase } = await requireUser();
  const p = await payableOf(supabase, input.type, input.id);
  await upsertControl(supabase, p.companyId, p.type, p.id, { notes: input.note.trim() || null });
  await audit(p.companyId, p.type, p.id, "note_saved", input.note.trim().slice(0, 200));
  refresh();
}
