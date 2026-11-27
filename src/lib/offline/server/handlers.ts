import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { recordAudit } from "@/lib/audit";
import { cleanWastageInput, describeWastage, WASTAGE_PATH, type WastageInput } from "@/lib/kitchen/wastage";
import { validatePettyCashEntry, pettyCashLabel } from "@/lib/operationPettyCash/rules";
import type { PettyCashEntryInput } from "@/lib/operationPettyCash/actions";
import { assertOwnPerson } from "@/lib/pettyCash/access";
import { autoCountNoOnSave } from "@/lib/finance/autocountCosts";
import { DELIVERY_STATUS_LABEL } from "@/lib/driver/constants";
import type { Mutation, OfflineOp } from "@/lib/offline/types";
import { Rejection, sameValues, type Handler, type HandlerResult } from "./core";

export type ServerCtx = { supabase: SupabaseClient<Database>; userId: string };

/** A check of the module that throws a message the person can act on refuses the change (it is not tried again by itself). */
function checked<T>(work: () => T): T {
  try {
    return work();
  } catch (err) {
    throw new Rejection(err instanceof Error ? err.message : "This change is not valid.");
  }
}

const isUnique = (error: { code?: string } | null) => error?.code === "23505";
const isRls = (error: { code?: string; message?: string } | null) => error?.code === "42501" || /row-level security/i.test(error?.message ?? "");

// ---------------------------------------------------------------- Kitchen: Wastage Log

function wastageInput(m: Mutation): WastageInput {
  const p = m.payload as Partial<WastageInput>;
  return {
    companyId: String(m.companyId ?? p.companyId ?? ""),
    wastedOn: String(p.wastedOn ?? ""),
    item: String(p.item ?? ""),
    quantity: Number(p.quantity),
    unit: p.unit ? String(p.unit) : undefined,
    reason: String(p.reason ?? ""),
    estimatedValue: p.estimatedValue === null || p.estimatedValue === undefined ? null : Number(p.estimatedValue),
    notes: p.notes ? String(p.notes) : undefined,
    documentId: p.documentId ? String(p.documentId) : null,
  };
}

function refreshWastage() {
  revalidatePath(WASTAGE_PATH);
  revalidatePath("/reports/monthly-breakdown");
}

const wastageCreate: Handler<ServerCtx> = async ({ supabase, userId }, m) => {
  const input = wastageInput(m);
  const values = checked(() => cleanWastageInput(input));
  if (!input.companyId) throw new Rejection("Choose the company.");
  // the record gets the id made on the device: sent twice, the second insert finds it and nothing is added
  const { error } = await supabase.from("wastage_log").insert({ id: m.recordId, ...values, company_id: input.companyId, created_by: userId });
  if (isUnique(error)) {
    const { data: row } = await supabase.from("wastage_log").select("id, created_by").eq("id", m.recordId).maybeSingle();
    if (row && row.created_by === userId) return { status: "duplicate", recordId: m.recordId };
    throw new Rejection("This entry could not be saved (its id is already used).");
  }
  if (isRls(error)) throw new Rejection("You do not have permission to add to the Wastage Log of this company.");
  if (error) throw error;
  await recordAudit({ companyId: input.companyId, relatedTable: "wastage_log", relatedId: m.recordId, action: "created", newValue: `${describeWastage(values)} (made offline)` });
  refreshWastage();
  return { status: "applied", recordId: m.recordId };
};

const wastageUpdate: Handler<ServerCtx> = async ({ supabase }, m) => {
  const input = wastageInput(m);
  const values = checked(() => cleanWastageInput(input));
  const base = m.base?.updatedAt ?? null;
  let query = supabase.from("wastage_log").update(values).eq("id", m.recordId);
  // the change is only applied over the version the person saw (unless they chose "Keep mine" after a conflict)
  if (!m.force) {
    if (!base) throw new Rejection("This change has no version to compare with. Open the entry again and make the change.");
    query = query.eq("updated_at", base);
  }
  const { data: changed, error } = await query.select("id");
  if (isRls(error)) throw new Rejection("Only the person who recorded this entry, or an admin of the company, can change it.");
  if (error) throw error;
  const { data: now } = await supabase.from("wastage_log").select("*").eq("id", m.recordId).maybeSingle();
  if (changed?.length) {
    await recordAudit({ companyId: now?.company_id ?? input.companyId, relatedTable: "wastage_log", relatedId: m.recordId, action: "updated", newValue: `${describeWastage(values)} (made offline)` });
    refreshWastage();
    return { status: "applied" };
  }
  if (!now) return { status: "conflict", table: "wastage_log", serverVersion: null, message: "This entry was deleted (or you can no longer change it) while you were offline." };
  if (sameValues(now, values)) return { status: "duplicate" };
  if (m.force) throw new Rejection("Only the person who recorded this entry, or an admin of the company, can change it.");
  return { status: "conflict", table: "wastage_log", serverVersion: now, message: "Somebody else changed this entry while you were offline." };
};

const wastageDelete: Handler<ServerCtx> = async ({ supabase }, m) => {
  const base = m.base?.updatedAt ?? null;
  const { data: before } = await supabase.from("wastage_log").select("*").eq("id", m.recordId).maybeSingle();
  // already gone: the delete was done before (or by somebody else); nothing to do
  if (!before) return { status: "duplicate" };
  if (!m.force && base && before.updated_at !== base && new Date(before.updated_at).getTime() !== new Date(base).getTime()) {
    return { status: "conflict", table: "wastage_log", serverVersion: before, message: "Somebody else changed this entry while you were offline, so it was not deleted." };
  }
  // deleted only if it is still the version just read (a change in between is not lost)
  const { data: removed, error } = await supabase.from("wastage_log").delete().eq("id", m.recordId).eq("updated_at", before.updated_at).select("id");
  if (error) throw error;
  if (!removed?.length) {
    const { data: again } = await supabase.from("wastage_log").select("*").eq("id", m.recordId).maybeSingle();
    if (!again) return { status: "duplicate" };
    if (again.updated_at !== before.updated_at) return { status: "conflict", table: "wastage_log", serverVersion: again, message: "Somebody else changed this entry while you were offline, so it was not deleted." };
    throw new Rejection("Only the person who recorded this entry, or an admin of the company, can delete it.");
  }
  await recordAudit({ companyId: before.company_id, relatedTable: "wastage_log", relatedId: m.recordId, action: "deleted", previousValue: describeWastage(before), newValue: "Deleted (made offline)" });
  refreshWastage();
  return { status: "applied" };
};

// ---------------------------------------------------------------- Driver & Logistics: delivery status

const OFFLINE_DELIVERY_STATUSES = ["scheduled", "in_transit", "cancelled"];

const deliverySetStatus: Handler<ServerCtx> = async ({ supabase }, m) => {
  const status = String((m.payload as { status?: unknown }).status ?? "");
  if (status === "delivered") throw new Rejection("Use 'Complete Task' to mark a delivery as delivered — it requires proof of delivery.");
  if (!OFFLINE_DELIVERY_STATUSES.includes(status)) throw new Rejection("Choose a valid status.");
  const seen = m.base?.status ?? null;
  // the status is only changed from the one the driver saw: a dispatcher who changed it meanwhile is never overwritten
  let query = supabase.from("deliveries").update({ status }).eq("id", m.recordId);
  if (!m.force) {
    if (!seen) throw new Rejection("This change has no status to compare with. Open the delivery again.");
    query = query.eq("status", seen);
  }
  const { data: changed, error } = await query.select("id, company_id");
  if (isRls(error)) throw new Rejection("You do not have permission to change this delivery.");
  if (error) throw error;
  if (changed?.length) {
    await recordAudit({
      companyId: changed[0].company_id,
      relatedTable: "deliveries",
      relatedId: m.recordId,
      action: status === "in_transit" ? "task_started" : "status_changed",
      previousValue: seen ?? undefined,
      newValue: `${status} (made offline)`,
    });
    revalidatePath("/driver-logistics");
    revalidatePath(`/driver-logistics/${m.recordId}`);
    revalidatePath("/");
    return { status: "applied" };
  }
  const { data: now } = await supabase.from("deliveries").select("id, company_id, status, updated_at, scheduled_time, location, notes").eq("id", m.recordId).maybeSingle();
  if (!now) return { status: "conflict", table: "deliveries", serverVersion: null, message: "This delivery was deleted (or you can no longer change it) while you were offline." };
  if (now.status === status) return { status: "duplicate" };
  if (m.force) throw new Rejection("You do not have permission to change this delivery.");
  const label = DELIVERY_STATUS_LABEL[now.status] ?? now.status;
  return { status: "conflict", table: "deliveries", serverVersion: now, message: `The status was changed to "${label}" by somebody else while you were offline.` };
};

// ---------------------------------------------------------------- Company Spending: Operation petty cash (one new entry)

const opPettyCashCreate: Handler<ServerCtx> = async ({ supabase, userId }, m) => {
  const p = m.payload as Partial<PettyCashEntryInput>;
  const input: PettyCashEntryInput = {
    companyId: String(m.companyId ?? p.companyId ?? ""),
    entryType: p.entryType as PettyCashEntryInput["entryType"],
    entryDate: String(p.entryDate ?? ""),
    category: p.category ? String(p.category) : undefined,
    description: p.description ? String(p.description) : undefined,
    remarks: p.remarks ? String(p.remarks) : undefined,
    invoiceNo: p.invoiceNo ? String(p.invoiceNo) : undefined,
    autoCountInvoiceNo: p.autoCountInvoiceNo === undefined ? undefined : String(p.autoCountInvoiceNo),
    amount: Number(p.amount),
    documentId: p.documentId ? String(p.documentId) : undefined,
    extraDocumentIds: Array.isArray(p.extraDocumentIds) ? p.extraDocumentIds.map(String) : [],
    personName: p.personName ? String(p.personName) : undefined,
    alsoCompanyIds: Array.isArray(p.alsoCompanyIds) ? p.alsoCompanyIds.map(String) : [],
    paymentMethod: p.paymentMethod ? String(p.paymentMethod) : undefined,
  };
  if (!input.companyId) throw new Rejection("Choose the company.");
  checked(() => validatePettyCashEntry(input));
  const { data: holder } = await supabase.rpc("user_can_use_operation_petty_cash");
  if (holder !== true) throw new Rejection("The Operation petty cash is private. Only the person who holds it and the Director of Finance can use it.");
  try {
    await assertOwnPerson(supabase, userId, input.personName);
  } catch (err) {
    throw new Rejection(err instanceof Error ? err.message : "You can only record your own petty cash.");
  }
  const { error } = await supabase.from("operation_petty_cash").insert({
    id: m.recordId,
    company_id: input.companyId,
    entry_type: input.entryType,
    entry_date: input.entryDate,
    category: input.entryType === "expense" ? input.category?.trim() || null : null,
    description: input.description?.trim() || null,
    remarks: input.remarks?.trim().slice(0, 500) || null,
    invoice_no: input.invoiceNo?.trim().slice(0, 100) || null,
    autocount_invoice_no: input.entryType === "top_up" ? null : autoCountNoOnSave(input.autoCountInvoiceNo, null),
    amount: input.amount,
    document_id: input.documentId || null,
    extra_document_ids: input.extraDocumentIds ?? [],
    person_name: input.personName?.trim().slice(0, 200) || null,
    person_position: null,
    shared_company_ids: (input.alsoCompanyIds ?? []).filter((id) => id !== input.companyId),
    payment_method: input.paymentMethod,
    created_by: userId,
  });
  if (isUnique(error)) {
    const { data: row } = await supabase.from("operation_petty_cash").select("id, created_by").eq("id", m.recordId).maybeSingle();
    if (row && row.created_by === userId) return { status: "duplicate", recordId: m.recordId };
    throw new Rejection("This entry could not be saved (its id is already used).");
  }
  if (isRls(error)) throw new Rejection("You do not have permission to add to this petty cash.");
  if (error) throw error;
  await recordAudit({ companyId: input.companyId, relatedTable: "operation_petty_cash", relatedId: m.recordId, action: "petty_cash_added", newValue: `${pettyCashLabel({ entry_type: input.entryType, amount: input.amount, entry_date: input.entryDate, description: input.description ?? null })} (made offline)` });
  revalidatePath("/spending/petty-cash");
  return { status: "applied", recordId: m.recordId };
};

export const SERVER_HANDLERS: Record<OfflineOp, Handler<ServerCtx>> = {
  "wastage.create": wastageCreate,
  "wastage.update": wastageUpdate,
  "wastage.delete": wastageDelete,
  "delivery.setStatus": deliverySetStatus,
  "opPettyCash.create": opPettyCashCreate,
};

export type { HandlerResult };
