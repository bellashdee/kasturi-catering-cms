"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  revalidatePath("/finance-admin/expenses");
  revalidatePath("/finance-admin");
  revalidatePath("/");
}

export async function createCostCategory(companyId: string, name: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("cost_categories").insert({ company_id: companyId, name });
  if (error) throw error;
  revalidatePath("/finance-admin/categories");
}

export type PettyCashInput = {
  companyId: string;
  type: "top_up" | "expense";
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
    category: input.category || null,
    description: input.description || null,
    amount: input.amount,
    transaction_date: input.transactionDate,
    document_id: input.documentId || null,
    created_by: userId,
  });
  if (error) throw error;
  revalidatePath("/finance-admin/petty-cash");
  revalidatePath("/finance-admin");
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
  revalidatePath("/finance-admin/budgets");
}

export type CustomerInvoiceInput = {
  companyId: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
};

export async function createCustomerInvoice(input: CustomerInvoiceInput) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("customer_invoices")
    .insert({
      company_id: input.companyId,
      customer_id: input.customerId,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate,
      due_date: input.dueDate,
      amount: input.amount,
      status: "pending_review" as InvoiceStatus,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/finance-admin/invoices");
  return data;
}

export type CustomerPaymentInput = {
  companyId: string;
  customerInvoiceId: string;
  amount: number;
  paymentDate: string;
};

/**
 * Records a customer payment against an invoice and, if it now covers the
 * full invoice amount, marks that invoice paid — the same status the
 * dashboard's Customer Outstanding figure already reads.
 */
export async function recordCustomerPayment(input: CustomerPaymentInput) {
  const { supabase } = await requireUser();

  const { error: paymentError } = await supabase.from("customer_payments").insert({
    company_id: input.companyId,
    customer_invoice_id: input.customerInvoiceId,
    amount: input.amount,
    payment_date: input.paymentDate,
  });
  if (paymentError) throw paymentError;

  const [{ data: invoice }, { data: payments }] = await Promise.all([
    supabase.from("customer_invoices").select("id, amount").eq("id", input.customerInvoiceId).single(),
    supabase.from("customer_payments").select("amount").eq("customer_invoice_id", input.customerInvoiceId),
  ]);

  const totalPaid = (payments ?? []).reduce((t, p) => t + Number(p.amount), 0);
  if (invoice && totalPaid >= Number(invoice.amount)) {
    await supabase.from("customer_invoices").update({ status: "paid" as InvoiceStatus }).eq("id", invoice.id);
  }

  revalidatePath("/finance-admin/invoices");
  revalidatePath(`/finance-admin/invoices/${input.customerInvoiceId}`);
  revalidatePath("/");
}
