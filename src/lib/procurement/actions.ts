"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { recordAudit } from "@/lib/audit";
import { confirmedPaymentDate, todayInMalaysia } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";

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

export type SupplierInvoiceInput = {
  companyId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  department?: string;
  purchaseOrderId?: string;
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
      purchase_order_id: input.purchaseOrderId || null,
      document_id: input.documentId || null,
      status: "pending_review" as InvoiceStatus,
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
  revalidatePath("/");
  return invoice;
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

  revalidatePath("/supplier-procurement/payments");
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

  revalidatePath("/supplier-procurement/payments");
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

  revalidatePath("/supplier-procurement/payments");
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
