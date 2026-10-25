"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { confirmedPaymentDate, todayInMalaysia } from "@/lib/format";
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

  revalidatePath("/spending/expenses");
  revalidatePath("/admin");
  revalidatePath("/");
}

export type CompanyExpenseRow = {
  id: string;
  company_id: string;
  category: string;
  department: string | null;
  amount: number;
  expense_date: string;
  notes: string | null;
  document_id: string | null;
  created_by: string | null;
};

async function requireExpenseAccess(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], companyId: string) {
  const { data } = await supabase.rpc("user_has_company_access", { target_company_id: companyId });
  if (data !== true) throw new Error("You cannot change the expenses of this company.");
}

function revalidateExpenses() {
  revalidatePath("/spending/expenses");
  revalidatePath("/admin");
  revalidatePath("/reports/expenses");
  revalidatePath("/");
}

/** Edit a company expense: category, department, amount, date and notes. */
export async function updateCompanyExpense(
  id: string,
  input: { category: string; department?: string; amount: number; expenseDate: string; notes?: string },
) {
  const { supabase } = await requireUser();
  const { data: before, error: readError } = await supabase.from("expenses").select("*").eq("id", id).single();
  if (readError || !before) throw new Error("Expense not found.");
  await requireExpenseAccess(supabase, before.company_id);
  if (!input.category.trim()) throw new Error("Choose the category.");
  if (!(input.amount >= 0)) throw new Error("Enter a valid amount.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)) throw new Error("Choose the expense date.");
  const { error } = await supabase
    .from("expenses")
    .update({ category: input.category.trim(), department: input.department?.trim() || null, amount: input.amount, expense_date: input.expenseDate, notes: input.notes?.trim() || null })
    .eq("id", id);
  if (error) throw new Error("Could not save the expense.");
  await recordAudit({
    companyId: before.company_id,
    relatedTable: "expenses",
    relatedId: id,
    action: "expense_edited",
    previousValue: `${before.category} · RM ${Number(before.amount).toFixed(2)} · ${before.expense_date}`,
    newValue: `${input.category.trim()} · RM ${Number(input.amount).toFixed(2)} · ${input.expenseDate}`,
  });
  revalidateExpenses();
}

/** Delete a company expense. The deleted row is returned so the person can Undo (restoreCompanyExpense). */
export async function deleteCompanyExpense(id: string): Promise<CompanyExpenseRow> {
  const { supabase } = await requireUser();
  const { data: before, error: readError } = await supabase.from("expenses").select("*").eq("id", id).single();
  if (readError || !before) throw new Error("Expense not found.");
  await requireExpenseAccess(supabase, before.company_id);
  // there is no delete policy for expenses: the access check above is the permission, the delete itself uses the service role
  const { error } = await createAdminClient().from("expenses").delete().eq("id", id);
  if (error) throw new Error("Could not delete the expense.");
  await recordAudit({
    companyId: before.company_id,
    relatedTable: "expenses",
    relatedId: id,
    action: "expense_deleted",
    previousValue: `${before.category} · RM ${Number(before.amount).toFixed(2)} · ${before.expense_date}`,
  });
  revalidateExpenses();
  return {
    id: before.id,
    company_id: before.company_id,
    category: before.category,
    department: before.department,
    amount: Number(before.amount),
    expense_date: before.expense_date,
    notes: before.notes,
    document_id: before.document_id,
    created_by: before.created_by,
  };
}

/** Undo a delete: the same expense (same id) is put back. */
export async function restoreCompanyExpense(row: CompanyExpenseRow) {
  const { supabase } = await requireUser();
  await requireExpenseAccess(supabase, row.company_id);
  const { error } = await supabase.from("expenses").insert({
    id: row.id,
    company_id: row.company_id,
    category: row.category,
    department: row.department,
    amount: row.amount,
    expense_date: row.expense_date,
    notes: row.notes,
    document_id: row.document_id,
    created_by: row.created_by,
  });
  if (error) throw new Error("Could not undo the delete.");
  await recordAudit({ companyId: row.company_id, relatedTable: "expenses", relatedId: row.id, action: "expense_restored", newValue: `${row.category} · RM ${row.amount.toFixed(2)} · ${row.expense_date}` });
  revalidateExpenses();
}

export async function createCostCategory(companyId: string, name: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("cost_categories").insert({ company_id: companyId, name });
  if (error) throw error;
  revalidatePath("/admin/categories");
}

/** Rename a company's cost category; its existing expenses and budgets follow the new name. */
export async function renameCostCategory(id: string, name: string) {
  const { supabase } = await requireUser();
  const newName = name.trim();
  if (!newName) throw new Error("Enter the category name.");
  const { data: before } = await supabase.from("cost_categories").select("*").eq("id", id).single();
  if (!before || !before.company_id) throw new Error("A default category cannot be changed.");
  await requireExpenseAccess(supabase, before.company_id);
  const { data: same } = await supabase.from("cost_categories").select("id, name").eq("company_id", before.company_id).neq("id", id);
  if (same?.some((c) => c.name.toUpperCase() === newName.toUpperCase())) throw new Error("This company already has a category with that name.");
  const { error } = await supabase.from("cost_categories").update({ name: newName }).eq("id", id);
  if (error) throw new Error("Could not rename the category.");
  await supabase.from("expenses").update({ category: newName }).eq("company_id", before.company_id).eq("category", before.name);
  await supabase.from("budgets").update({ category: newName }).eq("company_id", before.company_id).eq("category", before.name);
  await recordAudit({ companyId: before.company_id, relatedTable: "cost_categories", relatedId: id, action: "category_renamed", previousValue: before.name, newValue: newName });
  revalidatePath("/admin/categories");
  revalidateExpenses();
}

/** Delete a company's cost category (past expenses keep their category name; it just leaves the choice lists). Returns the row for Undo. */
export async function deleteCostCategory(id: string): Promise<{ id: string; company_id: string; name: string }> {
  const { supabase } = await requireUser();
  const { data: before } = await supabase.from("cost_categories").select("*").eq("id", id).single();
  if (!before || !before.company_id) throw new Error("A default category cannot be deleted.");
  await requireExpenseAccess(supabase, before.company_id);
  const { error } = await createAdminClient().from("cost_categories").delete().eq("id", id);
  if (error) throw new Error("Could not delete the category.");
  await recordAudit({ companyId: before.company_id, relatedTable: "cost_categories", relatedId: id, action: "category_deleted", previousValue: before.name });
  revalidatePath("/admin/categories");
  return { id: before.id, company_id: before.company_id, name: before.name };
}

/** Undo a category delete: the same category (same id) is put back. */
export async function restoreCostCategory(row: { id: string; company_id: string; name: string }) {
  const { supabase } = await requireUser();
  await requireExpenseAccess(supabase, row.company_id);
  const { error } = await supabase.from("cost_categories").insert({ id: row.id, company_id: row.company_id, name: row.name });
  if (error) throw new Error("Could not undo the delete.");
  revalidatePath("/admin/categories");
}

/** Change the amount, department and notes of a budget. */
export async function updateBudget(id: string, input: { budgetedAmount: number; department?: string; notes?: string }) {
  const { supabase } = await requireUser();
  if (!(input.budgetedAmount >= 0)) throw new Error("Enter a valid amount.");
  const { data: before } = await supabase.from("budgets").select("company_id, budgeted_amount, category").eq("id", id).single();
  if (!before) throw new Error("Budget not found.");
  const { error } = await supabase
    .from("budgets")
    .update({ budgeted_amount: input.budgetedAmount, department: input.department?.trim() || null, notes: input.notes?.trim() || null })
    .eq("id", id);
  if (error) throw new Error("Could not save the budget.");
  await recordAudit({
    companyId: before.company_id,
    relatedTable: "budgets",
    relatedId: id,
    action: "budget_edited",
    previousValue: `${before.category} · RM ${Number(before.budgeted_amount).toFixed(2)}`,
    newValue: `${before.category} · RM ${Number(input.budgetedAmount).toFixed(2)}`,
  });
  revalidatePath("/spending/budgets");
}

export async function deleteBudget(id: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("budgets").delete().eq("id", id).select("company_id, category, budgeted_amount");
  if (error || !data?.length) throw new Error("You cannot delete this budget.");
  await recordAudit({ companyId: data[0].company_id, relatedTable: "budgets", relatedId: id, action: "budget_deleted", previousValue: `${data[0].category} · RM ${Number(data[0].budgeted_amount).toFixed(2)}` });
  revalidatePath("/spending/budgets");
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
  /** who received the money (a top-up) and the position that holds the petty cash */
  personName?: string;
  personPosition?: string;
};

export async function createPettyCashTransaction(input: PettyCashInput): Promise<ActionResult> {
  return runAction(async () => {
  const { supabase, userId } = await requireUser();
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount more than 0.");
  if (input.type === "expense" && !input.claimantName?.trim()) throw new Error("Enter who is claiming this petty cash.");
  if (!input.personName?.trim() || !input.personPosition?.trim()) throw new Error("Choose whose petty cash this is: the name and the position.");
  const { data: created, error } = await supabase.from("petty_cash_transactions").insert({
    company_id: input.companyId,
    type: input.type,
    claimant_name: input.type === "expense" ? input.claimantName || null : null,
    claimant_department: input.type === "expense" ? input.claimantDepartment || null : null,
    payment_status: input.type === "expense" ? "pending_payment" : "paid",
    category: input.category || null,
    description: input.description || null,
    amount: input.amount,
    // the claim date: today (Malaysia) unless a date is given; the payment date is recorded separately when it is paid
    transaction_date: input.transactionDate || todayInMalaysia(),
    document_id: input.documentId || null,
    person_name: input.personName?.trim().slice(0, 200) || null,
    person_position: input.personPosition?.trim().slice(0, 200) || null,
    created_by: userId,
  }).select("id").single();
  if (error) throw error;
  await recordAudit({
    companyId: input.companyId,
    relatedTable: "petty_cash_transactions",
    relatedId: created.id,
    action: input.type === "expense" ? "claim_submitted" : "top_up_recorded",
    newValue: `RM ${Number(input.amount).toFixed(2)}${input.claimantName ? ` · ${input.claimantName}` : ""}${input.personName ? ` · ${input.personName}` : ""}`,
  });
  revalidatePath("/spending/petty-cash");
  revalidatePath("/admin");
  revalidatePath("/");
  return {};
  }, "Could not save. Please try again.");
}

export type MarkPettyCashPaidInput = {
  transactionId: string;
  paymentDate: string;
  paymentReference?: string;
  paymentRemarks?: string;
};

export async function markPettyCashPaid(input: MarkPettyCashPaidInput) {
  const { supabase, userId } = await requireUser();
  const paymentDate = confirmedPaymentDate(input.paymentDate);
  const { data: before } = await supabase.from("petty_cash_transactions").select("company_id, amount, payment_status").eq("id", input.transactionId).single();
  const { error } = await supabase
    .from("petty_cash_transactions")
    .update({
      payment_status: "paid",
      payment_date: paymentDate,
      payment_reference: input.paymentReference || null,
      payment_remarks: input.paymentRemarks || null,
      paid_by: userId,
    })
    .eq("id", input.transactionId);
  if (error) throw error;
  if (before) {
    await recordAudit({
      companyId: before.company_id,
      relatedTable: "petty_cash_transactions",
      relatedId: input.transactionId,
      action: "marked_paid",
      previousValue: before.payment_status,
      newValue: `Paid ${paymentDate} · RM ${Number(before.amount).toFixed(2)}`,
    });
  }
  revalidatePath("/spending/petty-cash");
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
  revalidatePath("/spending/budgets");
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
  await recordAudit({ companyId: input.companyId, relatedTable: "customer_invoices", relatedId: data.id, action: "created", newValue: `${input.invoiceNumber} · due ${input.dueDate}` });
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
  const paymentDate = confirmedPaymentDate(input.paymentDate);

  const { error: paymentError } = await supabase.from("customer_payments").insert({
    company_id: input.companyId,
    customer_invoice_id: input.customerInvoiceId,
    amount: input.amount,
    payment_date: paymentDate,
    payment_reference: input.paymentReference || null,
    payment_remarks: input.paymentRemarks || null,
    recorded_by: userId,
  });
  if (paymentError) throw paymentError;
  await recordAudit({
    companyId: input.companyId,
    relatedTable: "customer_invoices",
    relatedId: input.customerInvoiceId,
    action: "payment_recorded",
    newValue: `RM ${Number(input.amount).toFixed(2)} on ${paymentDate}`,
  });

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
  const paymentDate = confirmedPaymentDate(input.paymentDate);

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
      payment_date: paymentDate,
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
    newValue: paymentDate,
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
