"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { DUPLICATE_INVOICE_MESSAGE } from "@/lib/finance/constants";
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

export type CompanyExpenseInput = {
  companyId: string;
  category: string;
  department?: string;
  amount: number;
  expenseDate: string;
  notes?: string;
  documentId?: string;
};

export async function createCompanyExpense(input: CompanyExpenseInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("expenses").insert({
    company_id: input.companyId,
    category: input.category,
    department: input.department || null,
    amount: input.amount,
    expense_date: input.expenseDate,
    notes: input.notes || null,
    document_id: input.documentId || null,
    created_by: userId,
  });
  if (error) throw error;

  if (input.documentId) {
    await supabase
      .from("documents")
      .update({ extraction_status: "confirmed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", input.documentId);
  }

  revalidatePath("/finance/expenses");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function createCostCategory(companyId: string, name: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("cost_categories").insert({ company_id: companyId, name });
  if (error) throw error;
  revalidatePath("/admin/categories");
}

export type PettyCashInput = {
  companyId: string;
  type: "top_up" | "expense";
  claimantName?: string;
  claimantDepartment?: string;
  category?: string;
  description?: string;
  amount: number;
  transactionDate: string;
  documentId?: string;
};

export async function createPettyCashTransaction(input: PettyCashInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("petty_cash_transactions").insert({
    company_id: input.companyId,
    type: input.type,
    claimant_name: input.type === "expense" ? input.claimantName || null : null,
    claimant_department: input.type === "expense" ? input.claimantDepartment || null : null,
    payment_status: input.type === "expense" ? "pending_payment" : "paid",
    category: input.category || null,
    description: input.description || null,
    amount: input.amount,
    transaction_date: input.transactionDate,
    document_id: input.documentId || null,
    created_by: userId,
  });
  if (error) throw error;
  revalidatePath("/finance/petty-cash");
  revalidatePath("/admin");
  revalidatePath("/");
}

export type MarkPettyCashPaidInput = {
  transactionId: string;
  paymentDate: string;
  paymentReference?: string;
  paymentRemarks?: string;
};

export async function markPettyCashPaid(input: MarkPettyCashPaidInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("petty_cash_transactions")
    .update({
      payment_status: "paid",
      payment_date: input.paymentDate,
      payment_reference: input.paymentReference || null,
      payment_remarks: input.paymentRemarks || null,
      paid_by: userId,
    })
    .eq("id", input.transactionId);
  if (error) throw error;
  revalidatePath("/finance/petty-cash");
  revalidatePath("/admin");
  revalidatePath("/");
}

export type BudgetInput = {
  companyId: string;
  department?: string;
  category: string;
  year: number;
  month: number;
  budgetedAmount: number;
  notes?: string;
};

export async function createBudget(input: BudgetInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("budgets").insert({
    company_id: input.companyId,
    department: input.department || null,
    category: input.category,
    year: input.year,
    month: input.month,
    budgeted_amount: input.budgetedAmount,
    notes: input.notes || null,
    created_by: userId,
  });
  if (error) throw error;
  revalidatePath("/admin/budgets");
}

export type CustomerInvoiceInput = {
  companyId: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  description?: string;
  amount: number;
  taxAmount?: number;
  documentId?: string;
  confirmDuplicate?: boolean;
};

export async function createCustomerInvoice(input: CustomerInvoiceInput) {
  const { supabase } = await requireUser();

  if (!input.confirmDuplicate) {
    const { data: existing } = await supabase
      .from("customer_invoices")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("invoice_number", input.invoiceNumber)
      .maybeSingle();
    if (existing) throw new Error(DUPLICATE_INVOICE_MESSAGE);
  }

  const { data, error } = await supabase
    .from("customer_invoices")
    .insert({
      company_id: input.companyId,
      customer_id: input.customerId,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate,
      due_date: input.dueDate,
      description: input.description || null,
      amount: input.amount,
      tax_amount: input.taxAmount ?? 0,
      document_id: input.documentId || null,
      status: "issued" as InvoiceStatus,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/finance/invoices");
  return data;
}

export type CustomerPaymentInput = {
  companyId: string;
  customerInvoiceId: string;
  amount: number;
  paymentDate: string;
  paymentReference?: string;
  paymentRemarks?: string;
};

/**
 * Records a customer payment against an invoice and updates its status to
 * partially_paid or paid depending on how much of (amount + tax) is now
 * covered — the same figures the dashboard's Customer Outstanding reads.
 */
export async function recordCustomerPayment(input: CustomerPaymentInput) {
  const { supabase, userId } = await requireUser();

  const { error: paymentError } = await supabase.from("customer_payments").insert({
    company_id: input.companyId,
    customer_invoice_id: input.customerInvoiceId,
    amount: input.amount,
    payment_date: input.paymentDate,
    payment_reference: input.paymentReference || null,
    payment_remarks: input.paymentRemarks || null,
    recorded_by: userId,
  });
  if (paymentError) throw paymentError;

  const [{ data: invoice }, { data: payments }] = await Promise.all([
    supabase.from("customer_invoices").select("id, amount, tax_amount").eq("id", input.customerInvoiceId).single(),
    supabase.from("customer_payments").select("amount").eq("customer_invoice_id", input.customerInvoiceId),
  ]);

  const totalPaid = (payments ?? []).reduce((t, p) => t + Number(p.amount), 0);
  if (invoice) {
    const total = Number(invoice.amount) + Number(invoice.tax_amount ?? 0);
    const status: InvoiceStatus = totalPaid >= total ? "paid" : totalPaid > 0 ? "partially_paid" : "issued";
    await supabase.from("customer_invoices").update({ status }).eq("id", invoice.id);
  }

  revalidatePath("/finance/invoices");
  revalidatePath(`/finance/invoices/${input.customerInvoiceId}`);
  revalidatePath("/finance/outstanding");
  revalidatePath("/");
}

/**
 * The Outstanding Payment task-list "mark paid" action — fully settles an
 * invoice in one step (used when you're confirming a payment already
 * received in full, as opposed to recording a partial payment on the
 * invoice detail page via recordCustomerPayment).
 */
export async function markCustomerInvoicePaid(input: {
  customerInvoiceId: string;
  paymentDate: string;
  paymentReference?: string;
  paymentRemarks?: string;
}) {
  const { supabase, userId } = await requireUser();

  const { data: invoice, error: fetchError } = await supabase
    .from("customer_invoices")
    .select("id, company_id, amount, tax_amount")
    .eq("id", input.customerInvoiceId)
    .single();
  if (fetchError) throw fetchError;

  const { data: existingPayments } = await supabase
    .from("customer_payments")
    .select("amount")
    .eq("customer_invoice_id", input.customerInvoiceId);
  const alreadyPaid = (existingPayments ?? []).reduce((t, p) => t + Number(p.amount), 0);
  const total = Number(invoice.amount) + Number(invoice.tax_amount ?? 0);
  const remaining = Math.max(0, total - alreadyPaid);

  if (remaining > 0) {
    const { error: paymentError } = await supabase.from("customer_payments").insert({
      company_id: invoice.company_id,
      customer_invoice_id: invoice.id,
      amount: remaining,
      payment_date: input.paymentDate,
      payment_reference: input.paymentReference || null,
      payment_remarks: input.paymentRemarks || null,
      recorded_by: userId,
    });
    if (paymentError) throw paymentError;
  }

  await supabase.from("customer_invoices").update({ status: "paid" as InvoiceStatus }).eq("id", invoice.id);

  await logTaskAudit({
    companyId: invoice.company_id,
    relatedTable: "customer_invoices",
    relatedId: invoice.id,
    action: "marked_paid",
    newValue: input.paymentDate,
  });

  revalidatePath("/finance/invoices");
  revalidatePath(`/finance/invoices/${invoice.id}`);
  revalidatePath("/finance/outstanding");
  revalidatePath("/");
}

export async function saveMonthlySales(input: { companyId: string; year: number; month: number; salesAmount: number; notes?: string }) {
  const { supabase, userId } = await requireUser();
  if (!Number.isFinite(input.salesAmount) || input.salesAmount < 0) throw new Error("Enter a valid sales amount.");

  const { error } = await supabase.from("monthly_sales").upsert(
    {
      company_id: input.companyId,
      year: input.year,
      month: input.month,
      sales_amount: input.salesAmount,
      notes: input.notes?.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,year,month" },
  );
  if (error) throw error;

  revalidatePath("/admin");
  revalidatePath("/reports/monthly-costing");
}
