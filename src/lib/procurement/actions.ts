"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskAudit } from "@/lib/taskProofs/actions";
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
  items: { itemName: string; quantity: number; unitPrice: number }[];
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
      order_date: input.orderDate,
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

  revalidatePath("/supplier-procurement/orders");
  revalidatePath("/supplier-procurement/requests");
  return po;
}

export async function updatePurchaseOrderStatus(poId: string, status: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", poId);
  if (error) throw error;
  revalidatePath("/supplier-procurement/orders");
  revalidatePath(`/supplier-procurement/orders/${poId}`);
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
  items: { itemName: string; quantity: number; unitPrice: number }[];
};

export async function createSupplierInvoice(input: SupplierInvoiceInput) {
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

  const items = input.items.filter((i) => i.itemName.trim() && i.quantity > 0);
  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("supplier_invoice_items").insert(
      items.map((i) => ({
        supplier_invoice_id: invoice.id,
        item_name: i.itemName,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        line_total: Math.round(i.quantity * i.unitPrice * 100) / 100,
      })),
    );
    if (itemsError) throw itemsError;
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

  const { error: updateError } = await supabase
    .from("supplier_payments")
    .update({
      status: "paid",
      payment_date: input.paymentDate,
      payment_method: input.paymentMethod,
      reference_number: input.referenceNumber || null,
      receipt_document_id: input.receiptDocumentId || null,
    })
    .eq("id", paymentId);
  if (updateError) throw updateError;

  if (input.receiptDocumentId) {
    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", input.receiptDocumentId);
  }

  const [{ data: invoice }, { data: paidPayments }] = await Promise.all([
    supabase.from("supplier_invoices").select("id, amount").eq("id", payment.supplier_invoice_id).single(),
    supabase.from("supplier_payments").select("amount").eq("supplier_invoice_id", payment.supplier_invoice_id).eq("status", "paid"),
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
    newValue: input.paymentDate,
    reason: [input.paymentReference, input.paymentRemarks].filter(Boolean).join(" — ") || undefined,
  });

  revalidatePath("/supplier-procurement/invoices");
  revalidatePath(`/supplier-procurement/invoices/${invoice.id}`);
  revalidatePath("/finance/outstanding");
  revalidatePath("/");
}
