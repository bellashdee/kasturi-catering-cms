"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";
import { SNACK_STATUSES, ITEM_STATUS_LABEL } from "@/lib/snack/constants";
import type { SnackItem, WaSnack } from "@/lib/whatsapp/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const RECEIPT_BUCKET = "snack-receipts";
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const clean = (v: unknown, max = 1000) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
const positive = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

function refresh(id?: string) {
  revalidatePath("/supplier-procurement/jdt-snacks");
  if (id) revalidatePath(`/supplier-procurement/jdt-snacks/${id}`);
  revalidatePath("/signature-dashboard");
}

/** Signed in, and allowed to handle snack requests (Purchasing, Admin & Finance, or the Quotation Request people). */
async function requireHandler() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: ok } = await untyped(supabase).rpc("user_can_handle_snacks", { target_company_id: SIGNATURE_COMPANY_ID });
  if (ok !== true) throw new Error("Only Purchasing, Admin & Finance or Admin / Management can change JDT snack requests.");
  return { supabase, db: untyped(supabase), userId: user.id };
}

async function nextCode(db: ReturnType<typeof untyped>): Promise<string> {
  const now = new Date(Date.now() + 8 * 3600_000);
  const prefix = `SN-${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}-`;
  const { count } = await db.from("jdt_snack_requests").select("id", { count: "exact", head: true }).like("request_code", `${prefix}%`);
  return `${prefix}${String((count ?? 0) + 1).padStart(3, "0")}`;
}

function itemRows(requestId: string, items: SnackItem[]) {
  return items
    .filter((i) => i.name.trim())
    .map((i, n) => ({ request_id: requestId, sort_order: n, name: i.name.trim().slice(0, 200), requested_qty: positive(i.quantity), unit: positive(i.quantity) ? clean(i.unit, 20) : null, remarks: clean(i.remarks, 500) }));
}

/** Saves a JDT training snack request (from the WhatsApp import): item names as the Boss wrote them, missing quantities stay Pending. */
export async function createSnackRequestFromImport(importId: string | null, s: WaSnack): Promise<string> {
  const { db } = await requireHandler();
  if (s.items.filter((i) => i.name.trim()).length === 0) throw new Error("Add at least one item.");
  if (s.date && !DATE_RE.test(s.date)) throw new Error("Check the training date.");
  if (s.deliveryTime && !TIME_RE.test(s.deliveryTime)) throw new Error("Check the delivery time.");
  const code = await nextCode(db);
  const { data, error } = await db
    .from("jdt_snack_requests")
    .insert({
      company_id: SIGNATURE_COMPANY_ID,
      request_code: code,
      team: clean(s.team, 80) ?? "JDT II",
      training_date: s.date || null,
      date_text: clean(s.text, 120),
      date_needs_check: !!s.date && !s.yearStated,
      delivery_time: s.deliveryTime || null,
      delivery_location: clean(s.deliveryLocation, 300),
      remarks: clean(s.remarks, 2000),
      whatsapp_import_id: isUuid(importId) ? importId : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not save the snack request (${error.message}).`);
  const { error: itemsError } = await db.from("jdt_snack_items").insert(itemRows(data.id, s.items));
  if (itemsError) {
    await db.from("jdt_snack_requests").update({ status: "cancelled", remarks: "Items could not be saved." }).eq("id", data.id);
    throw new Error(`Could not save the items (${itemsError.message}).`);
  }
  await recordAudit({ companyId: SIGNATURE_COMPANY_ID, relatedTable: "jdt_snack_requests", relatedId: data.id, action: "created", newValue: `${code} · ${s.team} · ${s.date || "date pending"}` });
  refresh(data.id);
  return data.id as string;
}

/** A snack request typed in by hand (without a WhatsApp message). */
export async function createSnackRequest(s: WaSnack): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => ({ id: await createSnackRequestFromImport(null, s) }), "Could not save the snack request.");
}

export type SnackRequestPatch = { status?: string; trainingDate?: string; dateChecked?: boolean; deliveryTime?: string; deliveryLocation?: string; remarks?: string };

export async function updateSnackRequest(id: string, p: SnackRequestPatch): Promise<ActionResult> {
  return runAction(async () => {
    const { db, userId } = await requireHandler();
    const patch: Record<string, unknown> = { updated_by: userId };
    if (p.status !== undefined) {
      if (!SNACK_STATUSES.includes(p.status)) throw new Error("Choose a status from the list.");
      patch.status = p.status;
      if (p.status === "delivered") patch.delivered_at = new Date().toISOString();
    }
    if (p.trainingDate !== undefined) {
      if (p.trainingDate && !DATE_RE.test(p.trainingDate)) throw new Error("Check the training date.");
      patch.training_date = p.trainingDate || null;
    }
    if (p.dateChecked) patch.date_needs_check = false;
    if (p.deliveryTime !== undefined) patch.delivery_time = p.deliveryTime || null;
    if (p.deliveryLocation !== undefined) patch.delivery_location = clean(p.deliveryLocation, 300);
    if (p.remarks !== undefined) patch.remarks = clean(p.remarks, 2000);
    const { data: before } = await db.from("jdt_snack_requests").select("status, request_code").eq("id", id).maybeSingle();
    const { error } = await db.from("jdt_snack_requests").update(patch).eq("id", id);
    if (error) throw error;
    if (p.status && before && before.status !== p.status)
      await recordAudit({ companyId: SIGNATURE_COMPANY_ID, relatedTable: "jdt_snack_requests", relatedId: id, action: "status_changed", previousValue: before.status, newValue: p.status });
    refresh(id);
    return {};
  }, "Could not save. Please try again.");
}

export type SnackItemPatch = { name?: string; quantity?: number | null; unit?: string; remarks?: string; itemStatus?: string; substitute?: string };

export async function updateSnackItem(itemId: string, requestId: string, p: SnackItemPatch): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await requireHandler();
    const patch: Record<string, unknown> = {};
    if (p.name !== undefined) {
      if (!p.name.trim()) throw new Error("The item needs a name.");
      patch.name = p.name.trim().slice(0, 200);
    }
    if (p.quantity !== undefined) patch.requested_qty = positive(p.quantity);
    if (p.unit !== undefined) patch.unit = clean(p.unit, 20);
    if (p.remarks !== undefined) patch.remarks = clean(p.remarks, 500);
    if (p.itemStatus !== undefined) {
      if (!(p.itemStatus in ITEM_STATUS_LABEL)) throw new Error("Choose an item status.");
      patch.item_status = p.itemStatus;
    }
    if (p.substitute !== undefined) patch.substitute = clean(p.substitute, 200);
    const { error } = await db.from("jdt_snack_items").update(patch).eq("id", itemId).eq("request_id", requestId);
    if (error) throw error;
    refresh(requestId);
    return {};
  }, "Could not save the item.");
}

export async function addSnackItem(requestId: string, item: SnackItem): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await requireHandler();
    const { count } = await db.from("jdt_snack_items").select("id", { count: "exact", head: true }).eq("request_id", requestId);
    const rows = itemRows(requestId, [item]).map((r) => ({ ...r, sort_order: count ?? 0 }));
    if (rows.length === 0) throw new Error("Write the item name.");
    const { error } = await db.from("jdt_snack_items").insert(rows);
    if (error) throw error;
    refresh(requestId);
    return {};
  }, "Could not add the item.");
}

// ---------- purchases (the fund's expenses) ----------

/** A one-time upload link for a receipt (photo or PDF) of a snack purchase. */
export async function snackReceiptUpload(fileName: string): Promise<ActionResult<{ path: string; token: string }>> {
  return runAction(async () => {
    const { supabase } = await requireHandler();
    const ext = (fileName.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    if (!["jpg", "jpeg", "png", "webp", "heic", "pdf"].includes(ext)) throw new Error("A receipt must be a photo (JPG, PNG, WEBP, HEIC) or a PDF.");
    const path = `${SIGNATURE_COMPANY_ID}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error("Could not prepare the upload. Try again.");
    return { path: data.path, token: data.token };
  }, "Could not prepare the upload.");
}

export type SnackPurchaseInput = {
  requestId?: string | null;
  itemId?: string | null;
  purchaseDate: string;
  trainingDate?: string;
  description: string;
  quantity?: number | null;
  unit?: string;
  supplier?: string;
  unitPrice?: number | null;
  totalPrice?: number | null;
  paymentMethod?: string;
  receiptPath?: string;
  receiptName?: string;
  remarks?: string;
  /** mark the item Purchased at the same time */
  markItemPurchased?: boolean;
};

/** Records a snack purchase; its total is taken off the JDT II Snack Fund (never added to an event P&L). */
export async function recordSnackPurchase(input: SnackPurchaseInput): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await requireHandler();
    if (!DATE_RE.test(input.purchaseDate)) throw new Error("Enter the purchase date.");
    if (input.trainingDate && !DATE_RE.test(input.trainingDate)) throw new Error("Check the training date.");
    const description = input.description?.trim();
    if (!description) throw new Error("Describe what was bought.");
    const quantity = positive(input.quantity ?? null);
    const unitPrice = typeof input.unitPrice === "number" && input.unitPrice >= 0 ? input.unitPrice : null;
    let total = typeof input.totalPrice === "number" && input.totalPrice >= 0 ? input.totalPrice : null;
    if (total === null && quantity !== null && unitPrice !== null) total = Math.round(quantity * unitPrice * 100) / 100;
    if (total === null) throw new Error("Enter the total price (or the quantity and the unit price).");
    if (input.receiptPath && !input.receiptPath.startsWith(`${SIGNATURE_COMPANY_ID}/`)) throw new Error("The receipt upload is not valid. Upload it again.");
    const { error } = await db.from("jdt_snack_purchases").insert({
      company_id: SIGNATURE_COMPANY_ID,
      request_id: isUuid(input.requestId) ? input.requestId : null,
      item_id: isUuid(input.itemId) ? input.itemId : null,
      purchase_date: input.purchaseDate,
      training_date: input.trainingDate || null,
      description: description.slice(0, 300),
      quantity,
      unit: clean(input.unit, 20),
      supplier: clean(input.supplier, 200),
      unit_price: unitPrice,
      total_price: total,
      payment_method: clean(input.paymentMethod, 40),
      receipt_path: clean(input.receiptPath, 300),
      receipt_name: clean(input.receiptName, 200),
      remarks: clean(input.remarks, 1000),
    });
    if (error) throw error;
    if (input.markItemPurchased && isUuid(input.itemId) && isUuid(input.requestId)) {
      await db.from("jdt_snack_items").update({ item_status: "purchased" }).eq("id", input.itemId).eq("request_id", input.requestId);
    }
    await recordAudit({ companyId: SIGNATURE_COMPANY_ID, relatedTable: "jdt_snack_purchases", relatedId: isUuid(input.requestId) ? input.requestId : SIGNATURE_COMPANY_ID, action: "created", newValue: `${description} · RM${total.toFixed(2)}` });
    refresh(isUuid(input.requestId) ? input.requestId : undefined);
    return {};
  }, "Could not record the purchase.");
}

/** Removes a purchase keyed in by mistake (written to the audit trail). */
export async function deleteSnackPurchase(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await requireHandler();
    const { data: row } = await db.from("jdt_snack_purchases").select("description, total_price, request_id").eq("id", id).maybeSingle();
    if (!row) throw new Error("This purchase was not found.");
    const { error } = await db.from("jdt_snack_purchases").delete().eq("id", id);
    if (error) throw error;
    await recordAudit({ companyId: SIGNATURE_COMPANY_ID, relatedTable: "jdt_snack_purchases", relatedId: row.request_id ?? SIGNATURE_COMPANY_ID, action: "deleted", previousValue: `${row.description} · RM${Number(row.total_price).toFixed(2)}` });
    refresh(row.request_id ?? undefined);
    return {};
  }, "Could not remove the purchase.");
}

/** A short-lived link to open a purchase receipt. */
export async function snackReceiptUrl(purchaseId: string): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const { db, supabase } = await requireHandler();
    const { data: row } = await db.from("jdt_snack_purchases").select("receipt_path").eq("id", purchaseId).maybeSingle();
    if (!row?.receipt_path) throw new Error("No receipt was uploaded for this purchase.");
    const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(row.receipt_path, 300);
    if (error || !data) throw new Error("Could not open the receipt.");
    return { url: data.signedUrl };
  }, "Could not open the receipt.");
}

// ---------- the JDT II Snack Fund ----------

/** The Admin records that the one-time RM500 was actually received (after checking the payment). */
export async function markFundReceived(allocationId: string, receivedDate: string, reference: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await requireHandler();
    if (!DATE_RE.test(receivedDate)) throw new Error("Enter the date the payment was received.");
    if (!reference.trim()) throw new Error("Enter the payment reference (e.g. the bank transfer reference) so it can be checked later.");
    const { error } = await db.from("jdt_snack_fund_allocations").update({ received: true, received_date: receivedDate, received_reference: reference.trim().slice(0, 200) }).eq("id", allocationId);
    if (error) throw error;
    await recordAudit({ companyId: SIGNATURE_COMPANY_ID, relatedTable: "jdt_snack_fund_allocations", relatedId: allocationId, action: "payment_received", newValue: `${receivedDate} · ${reference.trim()}` });
    refresh();
    return {};
  }, "Could not record the payment.");
}

/** Asks for an additional allocation; it counts only after Management approves it, and is kept apart from the one-time RM500. */
export async function requestAdditionalAllocation(amount: number, remarks: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db } = await requireHandler();
    if (!(amount > 0)) throw new Error("Enter the amount.");
    if (!remarks.trim()) throw new Error("Write why the additional allocation is needed.");
    const { error } = await db.from("jdt_snack_fund_allocations").insert({ company_id: SIGNATURE_COMPANY_ID, kind: "additional", amount, remarks: remarks.trim().slice(0, 1000), payment_type: "Additional allocation" });
    if (error) throw error;
    refresh();
    return {};
  }, "Could not save the request.");
}

/** Management approves or rejects an additional allocation (the database also checks it is a company admin). */
export async function decideAdditionalAllocation(allocationId: string, approve: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { db, supabase } = await requireHandler();
    const { data: isAdmin } = await supabase.rpc("user_is_company_admin", { target_company_id: SIGNATURE_COMPANY_ID });
    if (isAdmin !== true) throw new Error("Only Management can approve an additional allocation.");
    const { error } = await db.from("jdt_snack_fund_allocations").update({ approval_status: approve ? "approved" : "rejected" }).eq("id", allocationId).eq("kind", "additional");
    if (error) throw error;
    await recordAudit({ companyId: SIGNATURE_COMPANY_ID, relatedTable: "jdt_snack_fund_allocations", relatedId: allocationId, action: approve ? "approved" : "rejected" });
    refresh();
    return {};
  }, "Could not save the decision.");
}
