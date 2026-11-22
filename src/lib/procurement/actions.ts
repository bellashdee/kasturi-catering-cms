"use server";

import { isModuleEditor } from "@/lib/moduleAccess";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { recordAudit } from "@/lib/audit";
import { confirmedPaymentDate, todayInMalaysia } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";
import { normalizeAutoCountNo } from "@/lib/finance/autocountCosts";

type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

export type SupplierInput = {
  companyId: string;
  name: string;
  category?: string;
  contactPerson?: string;
  phone?: string;
  paymentTerms?: string;
  status?: string;
};

export async function createSupplier(input: SupplierInput) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      company_id: input.companyId,
      name: input.name,
      category: input.category || null,
      contact_person: input.contactPerson || null,
      phone: input.phone || null,
      payment_terms: input.paymentTerms || null,
      status: input.status || "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/supplier-procurement");
  return data;
}

export async function updateSupplier(supplierId: string, input: Partial<SupplierInput>) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: input.name,
      category: input.category || null,
      contact_person: input.contactPerson || null,
      phone: input.phone || null,
      payment_terms: input.paymentTerms || null,
      status: input.status || "active",
    })
    .eq("id", supplierId);
  if (error) throw error;
  revalidatePath("/supplier-procurement");
  revalidatePath(`/supplier-procurement/${supplierId}`);
}

export type BulkSupplierRow = {
  name: string;
  category?: string;
  contactPerson?: string;
  phone?: string;
  paymentTerms?: string;
};

export async function bulkImportSuppliers(companyId: string, rows: BulkSupplierRow[]) {
  const { supabase } = await requireUser();
  const payload = rows
    .filter((r) => r.name?.trim())
    .map((r) => ({
      company_id: companyId,
      name: r.name.trim(),
      category: r.category || null,
      contact_person: r.contactPerson || null,
      phone: r.phone || null,
      payment_terms: r.paymentTerms || null,
    }));
  if (payload.length === 0) return { inserted: 0 };
  const { error, count } = await supabase.from("suppliers").insert(payload, { count: "exact" });
  if (error) throw error;
  revalidatePath("/supplier-procurement");
  return { inserted: count ?? payload.length };
}

export type ProcurementRequestInput = {
  companyId: string;
  department?: string;
  itemName: string;
  quantity: number;
  estimatedCost?: number;
  reason?: string;
};

/** Mirrors HR's leave_requests: its own status, plus a row in the shared `approvals` table. */
export async function createProcurementRequest(input: ProcurementRequestInput) {
  const { supabase, userId } = await requireUser();

  const { data: request, error: requestError } = await supabase
    .from("procurement_requests")
    .insert({
      company_id: input.companyId,
      requester_id: userId,
      department: input.department || null,
      item_name: input.itemName,
      quantity: input.quantity,
      estimated_cost: input.estimatedCost ?? null,
      reason: input.reason || null,
      status: "pending",
    })
    .select("id")
    .single();
  if (requestError) throw requestError;

  const { data: approval, error: approvalError } = await supabase
    .from("approvals")
    .insert({
      company_id: input.companyId,
      module: "supplier-procurement",
      related_table: "procurement_requests",
      related_id: request.id,
      status: "pending",
      requested_by: userId,
    })
    .select("id")
    .single();
  if (approvalError) throw approvalError;

  await supabase.from("procurement_requests").update({ approval_id: approval.id }).eq("id", request.id);

  revalidatePath("/supplier-procurement/requests");
  revalidatePath("/");
  return request;
}

export async function decideProcurementRequest(requestId: string, decision: "approved" | "rejected") {
  const { supabase } = await requireUser();

  const { data: request, error: fetchError } = await supabase
    .from("procurement_requests")
    .select("id, approval_id")
    .eq("id", requestId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase.from("procurement_requests").update({ status: decision }).eq("id", requestId);
  if (updateError) throw updateError;

  if (request.approval_id) {
    await supabase.from("approvals").update({ status: decision }).eq("id", request.approval_id);
  }

  revalidatePath("/supplier-procurement/requests");
  revalidatePath(`/supplier-procurement/requests/${requestId}`);
  revalidatePath("/");
}

export type PurchaseOrderInput = {
  companyId: string;
  poNumber: string;
  supplierId: string;
  orderDate: string;
  procurementRequestId?: string;
  items: { itemName: string; quantity: number; unit?: string; unitPrice: number }[];
};

export async function createPurchaseOrder(input: PurchaseOrderInput) {
  const { supabase, userId } = await requireUser();

  const items = input.items.filter((i) => i.itemName.trim() && i.quantity > 0);
  const totalAmount = items.reduce((t, i) => t + i.quantity * i.unitPrice, 0);

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      company_id: input.companyId,
      po_number: input.poNumber,
      supplier_id: input.supplierId,
      // the order date: today (Malaysia) unless another date is given
      order_date: input.orderDate || todayInMalaysia(),
      total_amount: Math.round(totalAmount * 100) / 100,
      status: "draft",
      created_by: userId,
    })
    .select("id")
    .single();
  if (poError) throw poError;

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("purchase_order_items").insert(
      items.map((i) => ({
        purchase_order_id: po.id,
        item_name: i.itemName,
        quantity: i.quantity,
        unit: i.unit?.trim() || null,
        unit_price: i.unitPrice,
        line_total: Math.round(i.quantity * i.unitPrice * 100) / 100,
      })),
    );
    if (itemsError) throw itemsError;
  }

  if (input.procurementRequestId) {
    await supabase
      .from("procurement_requests")
      .update({ status: "converted", purchase_order_id: po.id })
      .eq("id", input.procurementRequestId);
  }

  await recordAudit({
    companyId: input.companyId,
    relatedTable: "purchase_orders",
    relatedId: po.id,
    action: "created",
    newValue: `${input.poNumber} · RM ${totalAmount.toFixed(2)} · ${items.length} item(s)`,
  });
  revalidatePath("/supplier-procurement/orders");
  revalidatePath("/supplier-procurement/requests");
  return po;
}

export type PurchaseOrderEdit = {
  orderDate: string;
  /** names (and dates) of the events the order is for */
  sourceEvents: string;
  items: { itemName: string; quantity: number; unit?: string; unitPrice: number }[];
};

/** Changes the date, the events and the items of an order (the items are replaced as they are on the screen). */
export async function updatePurchaseOrder(poId: string, input: PurchaseOrderEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.orderDate)) throw new Error("Choose the order date.");
    const items = input.items.filter((i) => i.itemName.trim());
    if (items.length === 0) throw new Error("An order needs at least one item.");
    for (const i of items) {
      if (!Number.isFinite(i.quantity) || i.quantity <= 0) throw new Error(`Enter a quantity more than 0 for ${i.itemName.trim()}.`);
      if (!Number.isFinite(i.unitPrice) || i.unitPrice < 0) throw new Error(`Enter the price of ${i.itemName.trim()} (0 if it is not known yet).`);
    }
    const { data: before, error: readError } = await supabase.from("purchase_orders").select("*, purchase_order_items(*)").eq("id", poId).maybeSingle();
    if (readError || !before) throw new Error("This purchase order was not found (it may have been deleted).");

    const total = Math.round(items.reduce((t, i) => t + i.quantity * i.unitPrice, 0) * 100) / 100;
    const { error: poError } = await supabase.from("purchase_orders").update({ order_date: input.orderDate, source_events: input.sourceEvents.trim().slice(0, 500) || null, total_amount: total }).eq("id", poId);
    if (poError) throw poError;
    const { error: deleteError } = await supabase.from("purchase_order_items").delete().eq("purchase_order_id", poId);
    if (deleteError) throw deleteError;
    const { error: insertError } = await supabase.from("purchase_order_items").insert(
      items.map((i) => ({ purchase_order_id: poId, item_name: i.itemName.trim(), quantity: i.quantity, unit: i.unit?.trim() || null, unit_price: i.unitPrice, line_total: Math.round(i.quantity * i.unitPrice * 100) / 100 })),
    );
    if (insertError) {
      // the old items are put back so the order is never left empty
      await supabase.from("purchase_order_items").insert(before.purchase_order_items);
      throw insertError;
    }
    const line = (list: { item_name: string; quantity: number }[]) => list.map((i) => `${i.item_name} ${i.quantity}`).join("; ").slice(0, 700);
    await recordAudit({
      companyId: before.company_id,
      relatedTable: "purchase_orders",
      relatedId: poId,
      action: "edited",
      previousValue: `${before.order_date} · ${before.source_events ?? "no event"} · ${line(before.purchase_order_items)}`,
      newValue: `${input.orderDate} · ${input.sourceEvents.trim() || "no event"} · ${line(items.map((i) => ({ item_name: i.itemName.trim(), quantity: i.quantity })))}`,
    });
    revalidatePath("/supplier-procurement/orders");
    revalidatePath(`/supplier-procurement/orders/${poId}`);
    revalidatePath("/kitchen/purchase-requests");
    return {};
  }, "Could not save the purchase order. Please try again.");
}

export async function updatePurchaseOrderStatus(poId: string, status: string) {
  const { supabase } = await requireUser();
  const { data: before } = await supabase.from("purchase_orders").select("company_id, status").eq("id", poId).single();
  const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", poId);
  if (error) throw error;
  if (before) await recordAudit({ companyId: before.company_id, relatedTable: "purchase_orders", relatedId: poId, action: "status_changed", previousValue: before.status, newValue: status });
  revalidatePath("/supplier-procurement/orders");
  revalidatePath(`/supplier-procurement/orders/${poId}`);
}

/**
 * Deletes a purchase order that was placed by mistake. It is refused while a supplier invoice is linked to it (the invoice
 * would lose its order); a procurement request that was turned into this order goes back to "approved" so it can be ordered
 * again. The deletion is written to the audit log with the order's details. The message is returned, not thrown, so it is
 * always shown to the person.
 */
export type PurchaseOrderSnapshot = {
  po: Database["public"]["Tables"]["purchase_orders"]["Row"];
  items: Database["public"]["Tables"]["purchase_order_items"]["Row"][];
  requestIds: string[];
  listItemIds: string[];
};

export async function deletePurchaseOrder(poId: string): Promise<{ ok: boolean; error?: string; restore?: PurchaseOrderSnapshot }> {
  try {
    const { supabase } = await requireUser();
    const { data: po, error: readError } = await supabase
      .from("purchase_orders")
      .select("*, suppliers(name), purchase_order_items(*)")
      .eq("id", poId)
      .single();
    if (readError || !po) return { ok: false, error: "This purchase order was not found (it may already be deleted)." };

    const { data: invoices } = await supabase.from("supplier_invoices").select("invoice_number").eq("purchase_order_id", poId);
    if (invoices && invoices.length > 0) {
      return {
        ok: false,
        error: `Supplier invoice ${invoices.map((i) => i.invoice_number).join(", ")} is linked to this order, so it cannot be deleted. Set the order to Cancelled instead, or remove the invoice first.`,
      };
    }

    const summary = `${po.po_number} · ${po.suppliers?.name ?? "supplier"} · RM ${Number(po.total_amount ?? 0).toFixed(2)} · order date ${po.order_date} · status ${po.status} · ${po.purchase_order_items.length} item(s): ${po.purchase_order_items.map((i) => `${i.item_name} ${i.quantity} x ${i.unit_price}`).join("; ")}`.slice(0, 1500);

    const { data: requests } = await supabase.from("procurement_requests").select("id").eq("purchase_order_id", poId);
    const { data: listItems } = await supabase.from("purchase_list_items").select("id").eq("purchase_order_id", poId);

    const { error: itemsError } = await supabase.from("purchase_order_items").delete().eq("purchase_order_id", poId);
    if (itemsError) return { ok: false, error: itemsError.message };
    const { error: deleteError } = await supabase.from("purchase_orders").delete().eq("id", poId);
    if (deleteError) return { ok: false, error: deleteError.message };

    for (const r of requests ?? []) await supabase.from("procurement_requests").update({ status: "approved", purchase_order_id: null }).eq("id", r.id);

    await logTaskAudit({ companyId: po.company_id, relatedTable: "purchase_orders", relatedId: poId, action: "deleted", previousValue: summary, newValue: "Deleted (placed by mistake)" });

    revalidatePath("/supplier-procurement/orders");
    revalidatePath("/supplier-procurement/requests");
    revalidatePath("/kitchen/purchase-requests");
    const { suppliers: _supplier, purchase_order_items: items, ...row } = po;
    void _supplier;
    return { ok: true, restore: { po: row, items, requestIds: (requests ?? []).map((r) => r.id), listItemIds: (listItems ?? []).map((l) => l.id) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete the purchase order." };
  }
}

/** Undo of a delete: the order comes back with the same items, and the menu lines and requests that pointed to it point to it again. */
export async function restorePurchaseOrder(snapshot: PurchaseOrderSnapshot): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { po, items } = snapshot;
    if (!po?.id || !po.company_id || !Array.isArray(items)) throw new Error("There is nothing to put back.");
    const { error } = await supabase.from("purchase_orders").insert(po);
    if (error) throw error;
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("purchase_order_items").insert(items.map((i) => ({ ...i, purchase_order_id: po.id })));
      if (itemsError) {
        await supabase.from("purchase_orders").delete().eq("id", po.id);
        throw itemsError;
      }
    }
    if (snapshot.requestIds?.length) await supabase.from("procurement_requests").update({ status: "converted", purchase_order_id: po.id }).in("id", snapshot.requestIds);
    if (snapshot.listItemIds?.length) await supabase.from("purchase_list_items").update({ purchase_order_id: po.id }).in("id", snapshot.listItemIds);
    await recordAudit({ companyId: po.company_id, relatedTable: "purchase_orders", relatedId: po.id, action: "restored", newValue: `${po.po_number} put back after it was deleted` });
    revalidatePath("/supplier-procurement/orders");
    revalidatePath("/supplier-procurement/requests");
    revalidatePath("/kitchen/purchase-requests");
    return {};
  }, "Could not put the purchase order back.");
}

type Tables = Database["public"]["Tables"];
export type SupplierRow = Tables["suppliers"]["Row"];
export type InvoiceRow = Tables["supplier_invoices"]["Row"];
export type InvoiceItemRow = Tables["supplier_invoice_items"]["Row"];
export type InvoiceSnapshot = { invoice: InvoiceRow; items: InvoiceItemRow[] };
export type ProcurementRequestRow = Tables["procurement_requests"]["Row"];
export type ApprovalRow = Tables["approvals"]["Row"];
export type RequestSnapshot = { request: ProcurementRequestRow; approval: ApprovalRow | null };

async function requireAdminOf(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], companyId: string, message: string) {
  // a company admin, or a person on the module editors list (Mr. Adlan)
  if (!(await isModuleEditor(supabase, companyId, "supplier-procurement"))) throw new Error(message);
}

const countOf = async (query: PromiseLike<{ count: number | null }>) => (await query).count ?? 0;

/**
 * Deletes a supplier that nothing depends on. A supplier with orders, invoices, purchase lines or ingredient matches is kept (set it to Inactive
 * instead), because deleting it would also delete all of those. Returns the supplier so the delete can be undone.
 */
export async function deleteSupplier(id: string): Promise<ActionResult<{ row: SupplierRow }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: supplier } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
    if (!supplier) throw new Error("This supplier was not found (it may already be deleted).");
    await requireAdminOf(supabase, supplier.company_id, "Only an admin of the company can delete a supplier.");
    const head = { count: "exact" as const, head: true };
    const [orders, invoices, lines, matches, preferred] = await Promise.all([
      countOf(supabase.from("purchase_orders").select("id", head).eq("supplier_id", id)),
      countOf(supabase.from("supplier_invoices").select("id", head).eq("supplier_id", id)),
      countOf(supabase.from("supplier_purchase_lines").select("id", head).eq("supplier_id", id)),
      countOf(supabase.from("ingredient_supplier_matches").select("id", head).eq("supplier_id", id)),
      countOf(supabase.from("ingredients").select("id", head).eq("preferred_supplier_id", id)),
    ]);
    const used = [orders && `${orders} purchase order(s)`, invoices && `${invoices} invoice(s)`, lines && `${lines} item price line(s)`, matches && `${matches} ingredient match(es)`, preferred && `${preferred} ingredient(s) that prefer this supplier`].filter(Boolean);
    if (used.length > 0) throw new Error(`This supplier cannot be deleted: it has ${used.join(", ")}. Set the supplier to Inactive instead.`);
    const { data: removed, error } = await createAdminClient().from("suppliers").delete().eq("id", id).eq("company_id", supplier.company_id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the supplier.");
    await recordAudit({ companyId: supplier.company_id, relatedTable: "suppliers", relatedId: id, action: "deleted", previousValue: `${supplier.name} · ${supplier.phone ?? "no phone"}`, newValue: "Deleted" });
    revalidatePath("/supplier-procurement");
    return { row: supplier };
  }, "Could not delete the supplier. Please try again.");
}

/** Undo of a delete: the supplier comes back as it was. */
export async function restoreSupplier(row: SupplierRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!row?.id || !row.company_id) throw new Error("There is nothing to put back.");
    await requireAdminOf(supabase, row.company_id, "Only an admin of the company can put a supplier back.");
    const { error } = await supabase.from("suppliers").insert(row);
    if (error) throw new Error("Could not put the supplier back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "suppliers", relatedId: row.id, action: "restored", newValue: `${row.name} put back after it was deleted` });
    revalidatePath("/supplier-procurement");
    return {};
  }, "Could not put the supplier back.");
}

export type SupplierInvoiceEdit = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  department?: string;
  /** the AutoCount customer invoice number of the event this cost belongs to ("" = none) */
  autoCountInvoiceNo?: string;
  /** a note; for the GENERAL SUPPLIER it is the real supplier's name ("" = none) */
  remarks?: string;
  /** every line exactly as printed on the invoice: nothing is recalculated */
  items: { itemCode?: string; itemName: string; uom?: string; quantity: number; unitPrice: number; discount?: number; lineTotal: number }[];
};

/** Corrects a supplier invoice (header and lines). The figures are saved exactly as typed: no rounding, no recalculation. */
export async function updateSupplierInvoice(id: string, input: SupplierInvoiceEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("supplier_invoices").select("*, supplier_invoice_items(*)").eq("id", id).maybeSingle();
    if (!before) throw new Error("This invoice was not found (it may have been deleted).");
    const number = input.invoiceNumber?.trim();
    if (!number) throw new Error("Enter the invoice number.");
    for (const d of [input.invoiceDate, input.dueDate]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Enter valid invoice and due dates.");
    if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error("Enter the invoice amount.");
    for (const i of input.items) {
      if (!i.itemName?.trim()) throw new Error("Every line needs an item name (remove a line you do not need).");
      if (![i.quantity, i.unitPrice, i.lineTotal].every(Number.isFinite)) throw new Error(`Check the numbers of ${i.itemName.trim()}.`);
    }
    const { data: same } = await supabase.from("supplier_invoices").select("id").eq("company_id", before.company_id).eq("supplier_id", before.supplier_id).ilike("invoice_number", number.replace(/[\\%_]/g, "\\$&")).neq("id", id).limit(1);
    if ((same ?? []).length > 0) throw new Error("Another invoice of this supplier has the same invoice number.");

    const autoCountNo = input.autoCountInvoiceNo === undefined ? before.autocount_invoice_no : normalizeAutoCountNo(input.autoCountInvoiceNo) || null;
    const remarks = input.remarks === undefined ? before.remarks : input.remarks.trim() || null;
    const { error } = await supabase.from("supplier_invoices").update({ invoice_number: number, invoice_date: input.invoiceDate, due_date: input.dueDate, amount: input.amount, department: input.department?.trim() || null, autocount_invoice_no: autoCountNo, remarks }).eq("id", id);
    if (error) throw error;
    const { error: deleteError } = await supabase.from("supplier_invoice_items").delete().eq("supplier_invoice_id", id);
    if (deleteError) throw deleteError;
    if (input.items.length > 0) {
      const { error: insertError } = await supabase.from("supplier_invoice_items").insert(
        input.items.map((i) => ({ supplier_invoice_id: id, item_code: i.itemCode?.trim() || null, item_name: i.itemName.trim(), uom: i.uom?.trim() || null, quantity: i.quantity, unit_price: i.unitPrice, discount: i.discount ?? null, line_total: i.lineTotal })),
      );
      if (insertError) {
        await supabase.from("supplier_invoice_items").insert(before.supplier_invoice_items); // the lines it had are put back
        throw insertError;
      }
    }
    await recordAudit({ companyId: before.company_id, relatedTable: "supplier_invoices", relatedId: id, action: "edited", previousValue: `${before.invoice_number} · RM ${before.amount} · due ${before.due_date} · AutoCount ${before.autocount_invoice_no ?? "—"}`, newValue: `${number} · RM ${input.amount} · due ${input.dueDate} · AutoCount ${autoCountNo ?? "—"}` });
    revalidatePath("/supplier-procurement/invoices");
    revalidatePath("/finance/event-pnl", "layout");
    revalidatePath(`/supplier-procurement/invoices/${id}`);
    revalidatePath("/");
    return {};
  }, "Could not save the invoice. Please try again.");
}

/**
 * Deletes a supplier invoice (with its lines) that has no payment request or cost entry attached; those must be removed first. Returns the invoice
 * and its lines so the delete can be undone.
 */
export async function deleteSupplierInvoice(id: string): Promise<ActionResult<{ row: InvoiceSnapshot }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: invoice } = await supabase.from("supplier_invoices").select("*, supplier_invoice_items(*)").eq("id", id).maybeSingle();
    if (!invoice) throw new Error("This invoice was not found (it may already be deleted).");
    await requireAdminOf(supabase, invoice.company_id, "Only an admin of the company can delete an invoice.");
    const head = { count: "exact" as const, head: true };
    const [payments, costs] = await Promise.all([
      countOf(supabase.from("supplier_payments").select("id", head).eq("supplier_invoice_id", id)),
      countOf(supabase.from("event_cost_entries").select("id", head).eq("supplier_invoice_id", id)),
    ]);
    if (payments > 0) throw new Error(`This invoice has ${payments} payment request(s). Deal with them first (a paid invoice cannot be deleted).`);
    if (costs > 0) throw new Error("This invoice is used as a cost of an event. Remove it from the event first.");
    const { supplier_invoice_items: items, ...row } = invoice;
    const { data: removed, error } = await createAdminClient().from("supplier_invoices").delete().eq("id", id).eq("company_id", invoice.company_id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the invoice.");
    await recordAudit({ companyId: invoice.company_id, relatedTable: "supplier_invoices", relatedId: id, action: "deleted", previousValue: `${invoice.invoice_number} · RM ${invoice.amount} · ${items.length} line(s)`, newValue: "Deleted" });
    revalidatePath("/supplier-procurement/invoices");
    revalidatePath("/");
    return { row: { invoice: row, items } };
  }, "Could not delete the invoice. Please try again.");
}

/** Undo of a delete: the invoice and its lines come back exactly as they were. */
export async function restoreSupplierInvoice(snapshot: InvoiceSnapshot): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { invoice, items } = snapshot;
    if (!invoice?.id || !invoice.company_id) throw new Error("There is nothing to put back.");
    await requireAdminOf(supabase, invoice.company_id, "Only an admin of the company can put an invoice back.");
    const { error } = await supabase.from("supplier_invoices").insert(invoice);
    if (error) throw new Error("Could not put the invoice back.");
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("supplier_invoice_items").insert(items);
      if (itemsError) {
        await supabase.from("supplier_invoices").delete().eq("id", invoice.id);
        throw new Error("Could not put the invoice back.");
      }
    }
    await recordAudit({ companyId: invoice.company_id, relatedTable: "supplier_invoices", relatedId: invoice.id, action: "restored", newValue: `${invoice.invoice_number} put back after it was deleted` });
    revalidatePath("/supplier-procurement/invoices");
    revalidatePath("/");
    return {};
  }, "Could not put the invoice back.");
}

export type ProcurementRequestEdit = { itemName: string; quantity: number; estimatedCost?: number | null; reason?: string; department?: string };

/** Changes an item request that has not been turned into a purchase order yet. */
export async function updateProcurementRequest(id: string, input: ProcurementRequestEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("procurement_requests").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This request was not found (it may have been deleted).");
    if (before.status === "converted") throw new Error("This request is already a purchase order: change the order instead.");
    if (!input.itemName?.trim()) throw new Error("Write the item.");
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Enter a quantity more than 0.");
    if (input.estimatedCost !== null && input.estimatedCost !== undefined && (!Number.isFinite(input.estimatedCost) || input.estimatedCost < 0)) throw new Error("Enter a valid estimated cost.");
    const { error } = await supabase.from("procurement_requests").update({ item_name: input.itemName.trim(), quantity: input.quantity, estimated_cost: input.estimatedCost ?? null, reason: input.reason?.trim() || null, department: input.department?.trim() || null }).eq("id", id);
    if (error) throw error;
    await recordAudit({ companyId: before.company_id, relatedTable: "procurement_requests", relatedId: id, action: "edited", previousValue: `${before.item_name} × ${before.quantity}`, newValue: `${input.itemName.trim()} × ${input.quantity}` });
    revalidatePath("/supplier-procurement/orders");
    revalidatePath(`/supplier-procurement/requests/${id}`);
    return {};
  }, "Could not save the request. Please try again.");
}

/** Deletes an item request (with its approval record) that is not a purchase order; returns both so the delete can be undone. */
export async function deleteProcurementRequest(id: string): Promise<ActionResult<{ row: RequestSnapshot }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: request } = await supabase.from("procurement_requests").select("*").eq("id", id).maybeSingle();
    if (!request) throw new Error("This request was not found (it may already be deleted).");
    if (request.status === "converted") throw new Error("This request is already a purchase order. Delete the purchase order first; the request then goes back to Approved.");
    const { data: approval } = request.approval_id ? await supabase.from("approvals").select("*").eq("id", request.approval_id).maybeSingle() : { data: null };
    const { data: removed, error } = await supabase.from("procurement_requests").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the request.");
    if (approval) await supabase.from("approvals").delete().eq("id", approval.id);
    await recordAudit({ companyId: request.company_id, relatedTable: "procurement_requests", relatedId: id, action: "deleted", previousValue: `${request.item_name} × ${request.quantity} (${request.status})`, newValue: "Deleted" });
    revalidatePath("/supplier-procurement/orders");
    revalidatePath("/");
    return { row: { request, approval: approval ?? null } };
  }, "Could not delete the request. Please try again.");
}

/** Undo of a delete: the request (and its approval record) come back as they were. */
export async function restoreProcurementRequest(snapshot: RequestSnapshot): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { request, approval } = snapshot;
    if (!request?.id || !request.company_id) throw new Error("There is nothing to put back.");
    if (approval) {
      const { error: approvalError } = await supabase.from("approvals").insert(approval);
      if (approvalError) throw new Error("Could not put the request back.");
    }
    const { error } = await supabase.from("procurement_requests").insert(request);
    if (error) {
      if (approval) await supabase.from("approvals").delete().eq("id", approval.id);
      throw new Error("Could not put the request back.");
    }
    await recordAudit({ companyId: request.company_id, relatedTable: "procurement_requests", relatedId: request.id, action: "restored", newValue: `${request.item_name} put back after it was deleted` });
    revalidatePath("/supplier-procurement/orders");
    revalidatePath("/");
    return {};
  }, "Could not put the request back.");
}

export type SupplierInvoiceInput = {
  companyId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  department?: string;
  /** the AutoCount customer invoice number of the event this cost belongs to: the cost then counts in that event's P&L */
  autoCountInvoiceNo?: string;
  /** a note; for the GENERAL SUPPLIER it is the real supplier's name */
  remarks?: string;
  documentId?: string;
  /** every line exactly as printed on the invoice */
  items: { itemCode?: string; itemName: string; uom?: string; quantity: number; unitPrice: number; discount?: number; lineTotal: number }[];
};

async function createSupplierInvoiceImpl(input: SupplierInvoiceInput) {
  const { supabase, userId } = await requireUser();

  const { data: invoice, error: invoiceError } = await supabase
    .from("supplier_invoices")
    .insert({
      company_id: input.companyId,
      supplier_id: input.supplierId,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate,
      due_date: input.dueDate,
      amount: input.amount,
      department: input.department || null,
      autocount_invoice_no: normalizeAutoCountNo(input.autoCountInvoiceNo) || null,
      remarks: input.remarks?.trim() || null,
      document_id: input.documentId || null,
      // valid as soon as it is keyed in: no review or approval step
      status: "issued" as InvoiceStatus,
    })
    .select("id")
    .single();
  if (invoiceError) throw invoiceError;

  // Nothing is changed on the way in: the lines are stored with the quantity, price, discount and amount as given (no rounding,
  // no default quantity or price, no line dropped or recalculated).
  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("supplier_invoice_items").insert(
      input.items.map((i) => ({
        supplier_invoice_id: invoice.id,
        item_code: i.itemCode || null,
        item_name: i.itemName,
        uom: i.uom || null,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        discount: i.discount ?? null,
        line_total: i.lineTotal,
      })),
    );
    if (itemsError) {
      // the invoice must not be left without the lines it was entered with (suppliers' invoices have no delete policy, so the
      // rollback of this just-created row uses the admin client)
      await createAdminClient().from("supplier_invoices").delete().eq("id", invoice.id).eq("company_id", input.companyId);
      throw itemsError;
    }
  }

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", input.documentId);
  }

  revalidatePath("/supplier-procurement/invoices");
  revalidatePath("/finance/event-pnl", "layout");
  revalidatePath("/");
  return invoice;
}

export type AutoCountMatch = {
  invoiceNumber: string;
  companyName: string;
  customerName: string | null;
  eventId: string | null;
  eventName: string | null;
  eventReference: string | null;
  eventDate: string | null;
};

/**
 * The customer invoice in AutoCount with this number (in the person's companies) and the event it belongs to, shown under the
 * AutoCount Invoice No. field. An empty list means it is not in the system yet (it can still be saved and links when it is uploaded).
 */
export async function findAutoCountInvoice(number: string): Promise<ActionResult<{ matches: AutoCountMatch[] }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const wanted = normalizeAutoCountNo(number);
    if (!wanted) return { matches: [] };
    const { data, error } = await supabase.rpc("find_autocount_customer_invoice", { p_number: wanted });
    if (error) throw error;
    return {
      matches: (data ?? []).map((m) => ({
        invoiceNumber: m.invoice_number,
        companyName: m.company_name,
        customerName: m.customer_name,
        eventId: m.catering_event_id,
        eventName: m.event_name,
        eventReference: m.event_reference,
        eventDate: m.event_date,
      })),
    };
  }, "Could not look up the AutoCount invoice.");
}

/** Saves the invoice exactly as entered. Returns `{ ok: false, error }` instead of throwing (a thrown message is hidden in production). */
export async function createSupplierInvoice(input: SupplierInvoiceInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => ({ id: (await createSupplierInvoiceImpl(input)).id }), "Could not save the invoice. Please try again.");
}

export type SupplierPaymentInput = {
  companyId: string;
  supplierInvoiceId: string;
  amount: number;
};

/** This is the "payment request" — mirrors HR's leave_requests approval pattern. */
export async function createSupplierPayment(input: SupplierPaymentInput) {
  const { supabase, userId } = await requireUser();

  const { data: payment, error: paymentError } = await supabase
    .from("supplier_payments")
    .insert({
      company_id: input.companyId,
      supplier_invoice_id: input.supplierInvoiceId,
      amount: input.amount,
      status: "pending",
      requested_by: userId,
    })
    .select("id")
    .single();
  if (paymentError) throw paymentError;

  const { data: approval, error: approvalError } = await supabase
    .from("approvals")
    .insert({
      company_id: input.companyId,
      module: "supplier-procurement",
      related_table: "supplier_payments",
      related_id: payment.id,
      status: "pending",
      requested_by: userId,
    })
    .select("id")
    .single();
  if (approvalError) throw approvalError;

  await supabase.from("supplier_payments").update({ approval_id: approval.id }).eq("id", payment.id);

  revalidatePath(`/supplier-procurement/invoices/${input.supplierInvoiceId}`);
  revalidatePath("/");
  return payment;
}

export async function decideSupplierPayment(paymentId: string, decision: "approved" | "rejected") {
  const { supabase } = await requireUser();

  const { data: payment, error: fetchError } = await supabase
    .from("supplier_payments")
    .select("id, approval_id, supplier_invoice_id")
    .eq("id", paymentId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase.from("supplier_payments").update({ status: decision }).eq("id", paymentId);
  if (updateError) throw updateError;

  if (payment.approval_id) {
    await supabase.from("approvals").update({ status: decision }).eq("id", payment.approval_id);
  }

  revalidatePath(`/supplier-procurement/invoices/${payment.supplier_invoice_id}`);
  revalidatePath("/");
}

export type PaymentExecutionInput = {
  paymentDate: string;
  paymentMethod: string;
  referenceNumber?: string;
  receiptDocumentId?: string;
};

/**
 * Executes an approved payment request. If it covers the full invoice amount
 * (accounting for any other paid payments against the same invoice), the
 * invoice itself is marked paid — the same figure Finance & the dashboard's
 * Supplier Payments outstanding/overdue counts already read.
 */
export async function recordPaymentExecution(paymentId: string, input: PaymentExecutionInput) {
  const { supabase, userId } = await requireUser();

  const { data: payment, error: fetchError } = await supabase
    .from("supplier_payments")
    .select("id, amount, supplier_invoice_id, company_id")
    .eq("id", paymentId)
    .single();
  if (fetchError) throw fetchError;
  const supplierInvoiceId = payment.supplier_invoice_id;
  if (!supplierInvoiceId) throw new Error("This payment belongs to a Finance supplier payment. Confirm it in Madam Penny's Priority Centre.");

  // the payment date is the day the payment is confirmed (today unless the real, earlier payment day is given)
  const paymentDate = confirmedPaymentDate(input.paymentDate);
  const { error: updateError } = await supabase
    .from("supplier_payments")
    .update({
      status: "paid",
      payment_date: paymentDate,
      payment_method: input.paymentMethod,
      reference_number: input.referenceNumber || null,
      receipt_document_id: input.receiptDocumentId || null,
    })
    .eq("id", paymentId);
  if (updateError) throw updateError;
  await recordAudit({
    companyId: payment.company_id,
    relatedTable: "supplier_payments",
    relatedId: paymentId,
    action: "payment_executed",
    newValue: `RM ${Number(payment.amount).toFixed(2)} on ${paymentDate} · ${input.paymentMethod}`,
  });

  if (input.receiptDocumentId) {
    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", input.receiptDocumentId);
  }

  const [{ data: invoice }, { data: paidPayments }] = await Promise.all([
    supabase.from("supplier_invoices").select("id, amount").eq("id", supplierInvoiceId).single(),
    supabase.from("supplier_payments").select("amount").eq("supplier_invoice_id", supplierInvoiceId).eq("status", "paid"),
  ]);

  const totalPaid = (paidPayments ?? []).reduce((t, p) => t + Number(p.amount), 0);
  if (invoice && totalPaid >= Number(invoice.amount)) {
    await supabase.from("supplier_invoices").update({ status: "paid" as InvoiceStatus }).eq("id", invoice.id);
  }

  revalidatePath(`/supplier-procurement/invoices/${payment.supplier_invoice_id}`);
  revalidatePath("/");
}

/**
 * The Outstanding Payment task-list "mark paid" action for supplier
 * invoices — directly confirms the invoice itself is settled. Kept separate
 * from createSupplierPayment/decideSupplierPayment/recordPaymentExecution
 * (that's the formal payment-request approval trail for releasing funds);
 * this is for confirming an invoice is settled, however it was actually paid.
 */
export async function markSupplierInvoicePaid(input: {
  supplierInvoiceId: string;
  paymentDate: string;
  paymentReference?: string;
  paymentRemarks?: string;
}) {
  const { supabase } = await requireUser();
  const paymentDate = confirmedPaymentDate(input.paymentDate);

  const { data: invoice, error: fetchError } = await supabase
    .from("supplier_invoices")
    .select("id, company_id")
    .eq("id", input.supplierInvoiceId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from("supplier_invoices")
    .update({ status: "paid" as InvoiceStatus })
    .eq("id", input.supplierInvoiceId);
  if (updateError) throw updateError;

  await logTaskAudit({
    companyId: invoice.company_id,
    relatedTable: "supplier_invoices",
    relatedId: invoice.id,
    action: "marked_paid",
    newValue: paymentDate,
    reason: [input.paymentReference, input.paymentRemarks].filter(Boolean).join(" — ") || undefined,
  });

  revalidatePath("/supplier-procurement/invoices");
  revalidatePath(`/supplier-procurement/invoices/${invoice.id}`);
  revalidatePath("/finance/outstanding");
  revalidatePath("/");
}
