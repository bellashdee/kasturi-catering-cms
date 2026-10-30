"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { assertOwnPerson, claimPayers, pettyCashAccess } from "@/lib/pettyCash/access";
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
  /** the other companies the claim is also for (keyed in once, counted once) */
  alsoCompanyIds?: string[];
};

export async function createPettyCashTransaction(input: PettyCashInput): Promise<ActionResult> {
  return runAction(async () => {
  const { supabase, userId } = await requireUser();
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount more than 0.");
  if (input.type === "expense" && !input.claimantName?.trim()) throw new Error("Enter who is claiming this petty cash.");
  if (!input.personName?.trim() || !input.personPosition?.trim()) throw new Error("Choose whose petty cash this is: the name and the position.");
  await assertOwnPerson(supabase, userId, input.personName);
  if (input.type === "expense") {
    // a staff claim is claimed from Ms. Penny or Ms. Nabilah (the staff paid with their own money first)
    const same = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toUpperCase() === b.trim().replace(/\s+/g, " ").toUpperCase();
    const payers = await claimPayers();
    if (!payers.some((p) => same(p.name, input.personName ?? ""))) {
      throw new Error("A staff claim is claimed from the Director of Finance or her assistant. Choose one of them.");
    }
  }
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
    shared_company_ids: (input.alsoCompanyIds ?? []).filter((id) => id !== input.companyId),
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

export type SplitClaimInput = {
  claimantName: string;
  claimantDepartment?: string;
  category?: string;
  description?: string;
  transactionDate: string;
  documentId?: string;
  personName: string;
  personPosition: string;
  /** how much of the claim belongs to each company (the money of each company is kept apart); together they are the whole claim */
  shares: { companyId: string; amount: number }[];
};

/** A staff claim for more than one company: one claim for each company with its own share of the amount, all saved together or not at all. */
export async function createSplitPettyCashClaims(input: SplitClaimInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    if (!input.claimantName?.trim()) throw new Error("Enter who is claiming this petty cash.");
    if (!input.personName?.trim() || !input.personPosition?.trim()) throw new Error("Choose whose petty cash this is: the name and the position.");
    const shares = input.shares ?? [];
    if (shares.length < 2 || new Set(shares.map((s) => s.companyId)).size !== shares.length) throw new Error("Choose at least two different companies to split the claim.");
    if (shares.some((s) => !Number.isFinite(s.amount) || s.amount <= 0)) throw new Error("Enter an amount more than 0 for each company.");
    await assertOwnPerson(supabase, userId, input.personName);
    const same = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toUpperCase() === b.trim().replace(/\s+/g, " ").toUpperCase();
    if (!(await claimPayers()).some((p) => same(p.name, input.personName))) {
      throw new Error("A staff claim is claimed from the Director of Finance or her assistant. Choose one of them.");
    }
    const { data: created, error } = await supabase
      .from("petty_cash_transactions")
      .insert(
        shares.map((s) => ({
          company_id: s.companyId,
          type: "expense" as const,
          claimant_name: input.claimantName.trim(),
          claimant_department: input.claimantDepartment?.trim() || null,
          payment_status: "pending_payment" as const,
          category: input.category || null,
          description: input.description || null,
          amount: s.amount,
          transaction_date: input.transactionDate || todayInMalaysia(),
          document_id: input.documentId || null,
          person_name: input.personName.trim().slice(0, 200),
          person_position: input.personPosition.trim().slice(0, 200),
          shared_company_ids: [],
          created_by: userId,
        })),
      )
      .select("id, company_id, amount");
    if (error) throw error;
    for (const row of created ?? []) {
      await recordAudit({ companyId: row.company_id, relatedTable: "petty_cash_transactions", relatedId: row.id, action: "claim_submitted", newValue: `RM ${Number(row.amount).toFixed(2)} (split claim) · ${input.claimantName} · ${input.personName}` });
    }
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
  // the payment of a staff claim is recorded only by the Director of Finance and her assistant (the people who see everyone's petty cash)
  const { seeAll } = await pettyCashAccess(supabase, userId);
  if (!seeAll) throw new Error("Only the Director of Finance and her assistant can record the payment of a staff claim.");
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
      sales_type: "total",
      sales_amount: input.salesAmount,
      notes: input.notes?.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,year,month,sales_type" },
  );
  if (error) throw error;

  revalidatePath("/admin");
  revalidatePath("/reports/monthly-costing");
}

/** Signature Solution: the month's sales kept as catering events and daily sales. Replaces any single total entered before. */
export async function saveSplitMonthlySales(input: { companyId: string; year: number; month: number; cateringAmount: number; dailyAmount: number }) {
  const { supabase, userId } = await requireUser();
  for (const amount of [input.cateringAmount, input.dailyAmount]) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid sales amount.");
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("monthly_sales").upsert(
    [
      { sales_type: "catering", sales_amount: input.cateringAmount },
      { sales_type: "daily", sales_amount: input.dailyAmount },
    ].map((r) => ({ company_id: input.companyId, year: input.year, month: input.month, ...r, updated_by: userId, updated_at: now })),
    { onConflict: "company_id,year,month,sales_type" },
  );
  if (error) throw error;

  const { error: clearError } = await supabase
    .from("monthly_sales")
    .delete()
    .eq("company_id", input.companyId)
    .eq("year", input.year)
    .eq("month", input.month)
    .eq("sales_type", "total");
  if (clearError) throw clearError;

  revalidatePath("/admin");
  revalidatePath("/reports/monthly-costing");
}

type FTables = Database["public"]["Tables"];
export type CustomerInvoiceRow = FTables["customer_invoices"]["Row"];
export type CustomerPaymentRow = FTables["customer_payments"]["Row"];
export type PettyCashTransactionRow = FTables["petty_cash_transactions"]["Row"];

async function financeAdmin(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], companyId: string, message: string) {
  const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: companyId });
  if (data !== true) throw new Error(message);
}

/** Works the invoice status out again from what has been paid (the same rule as when a payment is recorded). */
async function refreshInvoiceStatus(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], invoiceId: string) {
  const [{ data: invoice }, { data: payments }] = await Promise.all([
    supabase.from("customer_invoices").select("id, amount, tax_amount, status").eq("id", invoiceId).maybeSingle(),
    supabase.from("customer_payments").select("amount").eq("customer_invoice_id", invoiceId),
  ]);
  if (!invoice) return;
  const paid = (payments ?? []).reduce((t, p) => t + Number(p.amount), 0);
  const total = Number(invoice.amount) + Number(invoice.tax_amount ?? 0);
  const status: InvoiceStatus = paid >= total && total > 0 ? "paid" : paid > 0 ? "partially_paid" : "issued";
  if (status !== invoice.status) await supabase.from("customer_invoices").update({ status }).eq("id", invoiceId);
}

function refreshInvoicePages(invoiceId?: string) {
  revalidatePath("/finance/invoices");
  if (invoiceId) revalidatePath(`/finance/invoices/${invoiceId}`);
  revalidatePath("/finance/outstanding");
  revalidatePath("/");
}

export type CustomerInvoiceEdit = { invoiceNumber: string; invoiceDate: string; dueDate: string; amount: number; taxAmount?: number; description?: string };

/** Corrects a customer invoice; the status is worked out again from the payments. */
export async function updateCustomerInvoice(id: string, input: CustomerInvoiceEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("customer_invoices").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This invoice was not found (it may have been deleted).");
    const number = input.invoiceNumber?.trim();
    if (!number) throw new Error("Enter the invoice number.");
    for (const d of [input.invoiceDate, input.dueDate]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Enter valid invoice and due dates.");
    if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error("Enter the invoice amount.");
    if (input.taxAmount !== undefined && (!Number.isFinite(input.taxAmount) || input.taxAmount < 0)) throw new Error("Enter a valid tax amount.");
    const { data: same } = await supabase.from("customer_invoices").select("id").eq("company_id", before.company_id).ilike("invoice_number", number.replace(/[\\%_]/g, "\\$&")).neq("id", id).limit(1);
    if ((same ?? []).length > 0) throw new Error("Another invoice of this company has the same invoice number.");
    const { error } = await supabase.from("customer_invoices").update({ invoice_number: number, invoice_date: input.invoiceDate, due_date: input.dueDate, amount: input.amount, tax_amount: input.taxAmount ?? 0, description: input.description?.trim() || null }).eq("id", id);
    if (error) throw error;
    await refreshInvoiceStatus(supabase, id);
    await recordAudit({ companyId: before.company_id, relatedTable: "customer_invoices", relatedId: id, action: "edited", previousValue: `${before.invoice_number} · RM ${before.amount} + ${before.tax_amount} tax · due ${before.due_date}`, newValue: `${number} · RM ${input.amount} + ${input.taxAmount ?? 0} tax · due ${input.dueDate}` });
    refreshInvoicePages(id);
    return {};
  }, "Could not save the invoice. Please try again.");
}

/** Deletes a customer invoice that has no payment and no revenue entry; returns it so the delete can be undone. */
export async function deleteCustomerInvoice(id: string): Promise<ActionResult<{ row: CustomerInvoiceRow }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: invoice } = await supabase.from("customer_invoices").select("*").eq("id", id).maybeSingle();
    if (!invoice) throw new Error("This invoice was not found (it may already be deleted).");
    await financeAdmin(supabase, invoice.company_id, "Only an admin of the company can delete an invoice.");
    const head = { count: "exact" as const, head: true };
    const [payments, revenue] = await Promise.all([
      supabase.from("customer_payments").select("id", head).eq("customer_invoice_id", id),
      supabase.from("event_revenue_entries").select("id", head).eq("customer_invoice_id", id),
    ]);
    if ((payments.count ?? 0) > 0) throw new Error(`This invoice has ${payments.count} payment(s) recorded. Delete the payments first.`);
    if ((revenue.count ?? 0) > 0) throw new Error("This invoice is counted as revenue of an event. Remove it from the event first.");
    const { data: removed, error } = await supabase.from("customer_invoices").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the invoice.");
    await recordAudit({ companyId: invoice.company_id, relatedTable: "customer_invoices", relatedId: id, action: "deleted", previousValue: `${invoice.invoice_number} · RM ${invoice.amount} · due ${invoice.due_date}`, newValue: "Deleted" });
    refreshInvoicePages();
    return { row: invoice };
  }, "Could not delete the invoice. Please try again.");
}

/** Undo of a delete: the invoice comes back as it was. */
export async function restoreCustomerInvoice(row: CustomerInvoiceRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!row?.id || !row.company_id) throw new Error("There is nothing to put back.");
    await financeAdmin(supabase, row.company_id, "Only an admin of the company can put an invoice back.");
    const { error } = await supabase.from("customer_invoices").insert(row);
    if (error) throw new Error("Could not put the invoice back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "customer_invoices", relatedId: row.id, action: "restored", newValue: `${row.invoice_number} put back after it was deleted` });
    refreshInvoicePages(row.id);
    return {};
  }, "Could not put the invoice back.");
}

export type CustomerPaymentEdit = { amount: number; paymentDate: string; paymentReference?: string; paymentRemarks?: string };

/** Corrects a customer payment (amount, date, reference); the invoice status is worked out again. */
export async function updateCustomerPayment(id: string, input: CustomerPaymentEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("customer_payments").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This payment was not found (it may have been deleted).");
    await financeAdmin(supabase, before.company_id, "Only an admin of the company can change a payment.");
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount more than 0.");
    const date = confirmedPaymentDate(input.paymentDate);
    const { error } = await supabase.from("customer_payments").update({ amount: input.amount, payment_date: date, payment_reference: input.paymentReference?.trim() || null, payment_remarks: input.paymentRemarks?.trim() || null }).eq("id", id);
    if (error) throw error;
    await refreshInvoiceStatus(supabase, before.customer_invoice_id);
    await recordAudit({ companyId: before.company_id, relatedTable: "customer_invoices", relatedId: before.customer_invoice_id, action: "payment_edited", previousValue: `RM ${before.amount} on ${before.payment_date}`, newValue: `RM ${input.amount} on ${date}` });
    refreshInvoicePages(before.customer_invoice_id);
    return {};
  }, "Could not save the payment. Please try again.");
}

/** Deletes a customer payment (the invoice status is worked out again); returns it so the delete can be undone. */
export async function deleteCustomerPayment(id: string): Promise<ActionResult<{ row: CustomerPaymentRow }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: payment } = await supabase.from("customer_payments").select("*").eq("id", id).maybeSingle();
    if (!payment) throw new Error("This payment was not found (it may already be deleted).");
    await financeAdmin(supabase, payment.company_id, "Only an admin of the company can delete a payment.");
    const { data: removed, error } = await supabase.from("customer_payments").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the payment.");
    await refreshInvoiceStatus(supabase, payment.customer_invoice_id);
    await recordAudit({ companyId: payment.company_id, relatedTable: "customer_invoices", relatedId: payment.customer_invoice_id, action: "payment_deleted", previousValue: `RM ${payment.amount} on ${payment.payment_date}`, newValue: "Deleted" });
    refreshInvoicePages(payment.customer_invoice_id);
    return { row: payment };
  }, "Could not delete the payment. Please try again.");
}

/** Undo of a delete: the payment comes back and the invoice status is worked out again. */
export async function restoreCustomerPayment(row: CustomerPaymentRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!row?.id || !row.company_id) throw new Error("There is nothing to put back.");
    await financeAdmin(supabase, row.company_id, "Only an admin of the company can put a payment back.");
    const { error } = await supabase.from("customer_payments").insert(row);
    if (error) throw new Error("Could not put the payment back.");
    await refreshInvoiceStatus(supabase, row.customer_invoice_id);
    await recordAudit({ companyId: row.company_id, relatedTable: "customer_invoices", relatedId: row.customer_invoice_id, action: "payment_restored", newValue: `RM ${row.amount} on ${row.payment_date} put back` });
    refreshInvoicePages(row.customer_invoice_id);
    return {};
  }, "Could not put the payment back.");
}

export type PettyCashClaimEdit = { claimantName?: string; claimantDepartment?: string; category?: string; description?: string; amount: number; transactionDate: string; companyId?: string; alsoCompanyIds?: string[] };

/** Who may change a petty cash claim or top-up: the admins of the company, and the person who made it while it is still waiting for payment. */
async function claimAccess(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, row: PettyCashTransactionRow) {
  const { data: admin } = await supabase.rpc("user_is_company_admin", { target_company_id: row.company_id });
  if (admin !== true && !(row.created_by === userId && row.payment_status !== "paid")) throw new Error("Only an admin, or the person who made it while it is not paid yet, can change this.");
  await assertOwnPerson(supabase, userId, row.person_name);
}

/** Changes a petty cash claim / top-up (who claimed, what for, the amount and the date). */
export async function updatePettyCashClaim(id: string, input: PettyCashClaimEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const { data: before } = await supabase.from("petty_cash_transactions").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This entry was not found (it may have been deleted).");
    await claimAccess(supabase, userId, before);
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter an amount more than 0.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transactionDate)) throw new Error("Choose the date.");
    if (before.type === "expense" && !input.claimantName?.trim()) throw new Error("Enter who is claiming this petty cash.");
    const { error } = await supabase
      .from("petty_cash_transactions")
      .update({
        claimant_name: before.type === "expense" ? input.claimantName?.trim() || null : null,
        claimant_department: before.type === "expense" ? input.claimantDepartment?.trim() || null : null,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        amount: input.amount,
        transaction_date: input.transactionDate,
        // the main company and the other companies it is also for (keyed once, counted once)
        ...(input.companyId ? { company_id: input.companyId, shared_company_ids: (input.alsoCompanyIds ?? []).filter((c) => c !== input.companyId) } : {}),
      })
      .eq("id", id);
    if (error) throw error;
    await recordAudit({ companyId: before.company_id, relatedTable: "petty_cash_transactions", relatedId: id, action: "edited", previousValue: `RM ${before.amount} · ${before.transaction_date} · ${before.claimant_name ?? ""}`, newValue: `RM ${input.amount} · ${input.transactionDate} · ${input.claimantName ?? ""}` });
    revalidatePath("/spending/petty-cash");
    revalidatePath("/admin");
    revalidatePath("/");
    return {};
  }, "Could not save. Please try again.");
}

/** Deletes a petty cash claim / top-up and returns it so the delete can be undone. */
export async function deletePettyCashClaim(id: string): Promise<ActionResult<{ row: PettyCashTransactionRow }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const { data: before } = await supabase.from("petty_cash_transactions").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This entry was not found (it may already be deleted).");
    await claimAccess(supabase, userId, before);
    const { data: removed, error } = await supabase.from("petty_cash_transactions").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the entry.");
    await recordAudit({ companyId: before.company_id, relatedTable: "petty_cash_transactions", relatedId: id, action: "deleted", previousValue: `RM ${before.amount} · ${before.transaction_date} · ${before.claimant_name ?? ""} (${before.payment_status})`, newValue: "Deleted" });
    revalidatePath("/spending/petty-cash");
    revalidatePath("/admin");
    revalidatePath("/");
    return { row: before };
  }, "Could not delete the entry. Please try again.");
}

/** Undo of a delete: the claim / top-up comes back as it was. */
export async function restorePettyCashClaim(row: PettyCashTransactionRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    if (!row?.id || !row.company_id) throw new Error("There is nothing to put back.");
    await claimAccess(supabase, userId, row);
    const { error } = await supabase.from("petty_cash_transactions").insert(row);
    if (error) throw new Error("Could not put the entry back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "petty_cash_transactions", relatedId: row.id, action: "restored", newValue: `RM ${row.amount} put back after it was deleted` });
    revalidatePath("/spending/petty-cash");
    revalidatePath("/admin");
    revalidatePath("/");
    return {};
  }, "Could not put the entry back.");
}
