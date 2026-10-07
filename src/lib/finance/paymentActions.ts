"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskAudit } from "@/lib/taskProofs/actions";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import {
  RENTAL_UTILITY_COMPANY_NAME,
  UTILITY_PROVIDER_BY_TYPE,
  maskAccount,
  type PaymentCategory,
  type UtilityType,
} from "@/lib/finance/payments";

type DB = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

async function requireFinanceAdmin(supabase: DB, companyId: string) {
  const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: companyId });
  if (data !== true) throw new Error("Only Finance / Admin users of this company can manage payments and bank details.");
}

/** Rental and utilities belong to Signature Solution only. */
async function assertCategoryAllowed(supabase: DB, companyId: string, category: PaymentCategory) {
  if (category === "supplier") return;
  const { data } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  if (data?.name !== RENTAL_UTILITY_COMPANY_NAME) {
    throw new Error(`Rental and utilities payments are only for ${RENTAL_UTILITY_COMPANY_NAME}.`);
  }
}

export type PaymentInput = {
  companyId: string;
  category: PaymentCategory;
  accountId?: string;
  payeeName: string;
  bankName?: string;
  accountNo?: string;
  utilityProvider?: string;
  utilityLocation?: string;
  utilityType?: UtilityType;
  paymentOf?: string;
  /** First day of the payment / billing month (YYYY-MM-01). */
  periodMonth: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  /** Optional: a payment imported from a checklist may not have a due date yet. */
  dueDate?: string;
  priority?: "high" | "medium" | "low";
  amount: number;
  voucherNumber?: string;
  documentId?: string;
  remarks?: string;
};

function validate(input: PaymentInput) {
  if (!input.payeeName?.trim()) throw new Error("Enter the payee / supplier name.");
  if (!/^\d{4}-\d{2}-01$/.test(input.periodMonth)) throw new Error("Select the payment month.");
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error("Enter a valid due date.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter the amount to pay (it must be more than 0).");
}

export type DuplicateHit = { id: string; label: string };

/**
 * Looks for an existing payment with the same company + payee + invoice/bill number + month + amount
 * (cancelled records do not exist; nothing is deleted, so every saved payment counts).
 */
export async function findDuplicatePayments(input: PaymentInput, excludeId?: string): Promise<DuplicateHit[]> {
  const { supabase } = await requireUser();
  let query = supabase
    .from("finance_payments")
    .select("id, payee_name, invoice_number, amount, status, utility_location, utility_provider")
    .eq("company_id", input.companyId)
    .eq("category", input.category)
    .eq("period_month", input.periodMonth)
    .ilike("payee_name", input.payeeName.trim());
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;

  return (data ?? [])
    .filter((p) => {
      const sameInvoice = (p.invoice_number ?? "").trim().toLowerCase() === (input.invoiceNumber ?? "").trim().toLowerCase();
      const sameAmount = Math.abs(Number(p.amount) - input.amount) < 0.005;
      const sameProvider = input.category !== "utility" || (p.utility_provider ?? "") === (input.utilityProvider ?? "");
      return sameInvoice && sameAmount && sameProvider;
    })
    .map((p) => ({
      id: p.id,
      label: `${p.payee_name}${p.invoice_number ? ` · ${p.invoice_number}` : ""} · RM ${Number(p.amount).toFixed(2)} · ${p.status === "paid" ? "Paid" : "Pending"}`,
    }));
}

/** Remembers the supplier / payee (and its bank details) in the reference list so it can be selected next time. */
async function rememberAccount(supabase: DB, input: PaymentInput, userId: string): Promise<string | undefined> {
  if (input.accountId) return input.accountId;
  if (input.category !== "supplier") return undefined;

  const { data: existing } = await supabase
    .from("payment_accounts")
    .select("id, bank_name, account_no")
    .eq("company_id", input.companyId)
    .eq("category", "supplier")
    .ilike("name", input.payeeName.trim())
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("payment_accounts")
    .insert({ company_id: input.companyId, category: "supplier", name: input.payeeName.trim(), bank_name: input.bankName?.trim() || null, account_no: input.accountNo?.trim() || null })
    .select("id")
    .single();
  if (created) {
    await logTaskAudit({ companyId: input.companyId, relatedTable: "payment_accounts", relatedId: created.id, action: "account_created", newValue: `${input.payeeName.trim()} ${maskAccount(input.accountNo)}` });
  }
  void userId;
  return created?.id;
}

/**
 * Creates a payment after the user has reviewed and confirmed the details (typed in, or read from an uploaded
 * document). Returns the possible duplicates instead of saving when a matching record already exists.
 */
export async function createPayment(input: PaymentInput, options: { allowDuplicate?: boolean } = {}): Promise<{ id: string } | { duplicates: DuplicateHit[] }> {
  const { supabase, userId } = await requireUser();
  validate(input);
  await requireFinanceAdmin(supabase, input.companyId);
  await assertCategoryAllowed(supabase, input.companyId, input.category);

  if (!options.allowDuplicate) {
    const duplicates = await findDuplicatePayments(input);
    if (duplicates.length > 0) return { duplicates };
  }

  const accountId = await rememberAccount(supabase, input, userId);
  const { data, error } = await supabase
    .from("finance_payments")
    .insert({
      company_id: input.companyId,
      category: input.category,
      account_id: accountId ?? null,
      payee_name: input.payeeName.trim(),
      bank_name: input.bankName?.trim() || null,
      account_no: input.accountNo?.trim() || null,
      utility_provider: input.utilityProvider || (input.utilityType ? UTILITY_PROVIDER_BY_TYPE[input.utilityType] : null),
      utility_location: input.utilityLocation?.trim() || null,
      utility_type: input.utilityType ?? null,
      payment_of: input.paymentOf?.trim() || null,
      period_month: input.periodMonth,
      invoice_number: input.invoiceNumber?.trim() || null,
      invoice_date: input.invoiceDate || null,
      due_date: input.dueDate || null,
      priority: input.priority ?? null,
      amount: input.amount,
      voucher_number: input.voucherNumber?.trim() || null,
      document_id: input.documentId ?? null,
      remarks: input.remarks?.trim() || null,
      approved_by: userId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  await logTaskAudit({
    companyId: input.companyId,
    relatedTable: "finance_payments",
    relatedId: data.id,
    action: "payment_created",
    newValue: `${input.payeeName.trim()} · RM ${input.amount.toFixed(2)}${input.dueDate ? ` · due ${input.dueDate}` : ""}`,
    reason: options.allowDuplicate ? "Saved after a possible-duplicate warning" : undefined,
  });

  revalidatePaymentPaths();
  return { id: data.id };
}

type EditableField = {
  key: keyof PaymentInput;
  column: string;
  label: string;
  sensitive?: boolean;
};

const EDITABLE: EditableField[] = [
  { key: "payeeName", column: "payee_name", label: "Payee" },
  { key: "bankName", column: "bank_name", label: "Bank name", sensitive: true },
  { key: "accountNo", column: "account_no", label: "Bank account no.", sensitive: true },
  { key: "paymentOf", column: "payment_of", label: "In payment of" },
  { key: "periodMonth", column: "period_month", label: "Payment month" },
  { key: "invoiceNumber", column: "invoice_number", label: "Invoice / bill no." },
  { key: "invoiceDate", column: "invoice_date", label: "Invoice / bill date" },
  { key: "dueDate", column: "due_date", label: "Due date" },
  { key: "priority", column: "priority", label: "Priority" },
  { key: "amount", column: "amount", label: "Amount" },
  { key: "voucherNumber", column: "voucher_number", label: "Voucher no." },
  { key: "remarks", column: "remarks", label: "Remarks" },
];

/** Edit a payment. Every changed field is recorded in the audit trail; bank details are logged masked. */
export async function updatePayment(paymentId: string, input: PaymentInput): Promise<{ id: string } | { duplicates: DuplicateHit[] }> {
  const { supabase } = await requireUser();
  validate(input);

  const { data: current } = await supabase.from("finance_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!current) throw new Error("Payment not found.");
  await requireFinanceAdmin(supabase, current.company_id);
  if (input.companyId !== current.company_id || input.category !== current.category) throw new Error("The company and category of a payment cannot be changed.");

  const duplicates = await findDuplicatePayments(input, paymentId);
  if (duplicates.length > 0) return { duplicates };

  const next = {
    payee_name: input.payeeName.trim(),
    bank_name: input.bankName?.trim() || null,
    account_no: input.accountNo?.trim() || null,
    payment_of: input.paymentOf?.trim() || null,
    period_month: input.periodMonth,
    invoice_number: input.invoiceNumber?.trim() || null,
    invoice_date: input.invoiceDate || null,
    due_date: input.dueDate || null,
    priority: input.priority ?? null,
    amount: input.amount,
    voucher_number: input.voucherNumber?.trim() || null,
    remarks: input.remarks?.trim() || null,
    ...(input.documentId ? { document_id: input.documentId } : {}),
  };

  const changes: string[] = [];
  let bankChanged = false;
  for (const f of EDITABLE) {
    const before = (current as Record<string, unknown>)[f.column];
    const after = (next as Record<string, unknown>)[f.column];
    const norm = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v));
    if (f.column === "amount" ? Math.abs(Number(before) - Number(after)) < 0.005 : norm(before) === norm(after)) continue;
    if (f.sensitive) {
      bankChanged = true;
      changes.push(`${f.label}: ${f.column === "account_no" ? maskAccount(String(before ?? "")) : norm(before) || "(none)"} → ${f.column === "account_no" ? maskAccount(String(after ?? "")) : norm(after) || "(none)"}`);
    } else {
      changes.push(`${f.label}: ${norm(before) || "(none)"} → ${norm(after) || "(none)"}`);
    }
  }
  if (input.documentId && input.documentId !== current.document_id) changes.push("Supporting document replaced");

  if (changes.length === 0) return { id: paymentId };

  const { error } = await supabase.from("finance_payments").update(next).eq("id", paymentId);
  if (error) throw error;

  await logTaskAudit({ companyId: current.company_id, relatedTable: "finance_payments", relatedId: paymentId, action: "payment_edited", newValue: changes.join("; ") });
  if (bankChanged) {
    await logTaskAudit({ companyId: current.company_id, relatedTable: "finance_payments", relatedId: paymentId, action: "bank_changed", newValue: `Bank details changed (${maskAccount(next.account_no)})` });
  }

  revalidatePaymentPaths(paymentId);
  return { id: paymentId };
}

/** Pending -> Paid. Needs the actual payment date and a payment reference; the proof is attached when available. */
export async function markPaymentPaid(paymentId: string, input: { paidDate: string; paymentReference: string; proofDocumentId?: string }) {
  const { supabase } = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidDate)) throw new Error("Enter the actual payment date.");
  if (input.paidDate > todayInMalaysia()) throw new Error("The payment date cannot be in the future.");
  if (!input.paymentReference?.trim()) throw new Error("Enter the payment reference.");

  const { data: current } = await supabase.from("finance_payments").select("company_id, status, amount, payee_name").eq("id", paymentId).maybeSingle();
  if (!current) throw new Error("Payment not found.");
  await requireFinanceAdmin(supabase, current.company_id);
  if (current.status === "paid") throw new Error("This payment is already marked as paid.");

  const { error } = await supabase
    .from("finance_payments")
    .update({ status: "paid", paid_date: input.paidDate, payment_reference: input.paymentReference.trim(), proof_document_id: input.proofDocumentId ?? null })
    .eq("id", paymentId);
  if (error) throw error;

  await logTaskAudit({
    companyId: current.company_id,
    relatedTable: "finance_payments",
    relatedId: paymentId,
    action: "payment_paid",
    previousValue: "pending",
    newValue: `paid ${input.paidDate} · ref ${input.paymentReference.trim()}${input.proofDocumentId ? " · proof attached" : ""}`,
  });
  revalidatePaymentPaths(paymentId);
}

/** Attach the Payment Voucher to the payment it belongs to (the company is fixed by the payment record). */
export async function attachPaymentVoucher(paymentId: string, input: { documentId: string; voucherNumber?: string }) {
  const { supabase } = await requireUser();
  const { data: current } = await supabase.from("finance_payments").select("company_id").eq("id", paymentId).maybeSingle();
  if (!current) throw new Error("Payment not found.");
  await requireFinanceAdmin(supabase, current.company_id);

  const { error } = await supabase
    .from("finance_payments")
    .update({ voucher_document_id: input.documentId, ...(input.voucherNumber?.trim() ? { voucher_number: input.voucherNumber.trim() } : {}) })
    .eq("id", paymentId);
  if (error) throw error;

  await logTaskAudit({
    companyId: current.company_id,
    relatedTable: "finance_payments",
    relatedId: paymentId,
    action: "voucher_uploaded",
    newValue: input.voucherNumber?.trim() ? `Voucher ${input.voucherNumber.trim()}` : "Payment voucher uploaded",
  });
  revalidatePaymentPaths(paymentId);
}

export type AccountInput = {
  companyId: string;
  category: PaymentCategory;
  name: string;
  provider?: string;
  utilityType?: UtilityType;
  bankName?: string;
  accountNo?: string;
  defaultDueDay?: number;
  notes?: string;
  isActive?: boolean;
};

/** Add or edit a reference account (supplier, rental payee, utility account). Bank changes are audited (masked). */
export async function saveAccount(input: AccountInput, accountId?: string) {
  const { supabase } = await requireUser();
  if (!input.name?.trim()) throw new Error("Enter the name.");
  await requireFinanceAdmin(supabase, input.companyId);
  await assertCategoryAllowed(supabase, input.companyId, input.category);

  const row = {
    company_id: input.companyId,
    category: input.category,
    name: input.name.trim(),
    provider: input.provider?.trim() || null,
    utility_type: input.utilityType ?? null,
    bank_name: input.bankName?.trim() || null,
    account_no: input.accountNo?.trim() || null,
    default_due_day: input.defaultDueDay ?? null,
    notes: input.notes?.trim() || null,
    is_active: input.isActive ?? true,
  };

  if (accountId) {
    const { data: before } = await supabase.from("payment_accounts").select("*").eq("id", accountId).maybeSingle();
    if (!before) throw new Error("Account not found.");
    const { error } = await supabase.from("payment_accounts").update(row).eq("id", accountId);
    if (error) throw error;
    const bankChanged = (before.bank_name ?? "") !== (row.bank_name ?? "") || (before.account_no ?? "") !== (row.account_no ?? "");
    await logTaskAudit({ companyId: input.companyId, relatedTable: "payment_accounts", relatedId: accountId, action: "account_edited", newValue: row.name });
    if (bankChanged) {
      await logTaskAudit({
        companyId: input.companyId,
        relatedTable: "payment_accounts",
        relatedId: accountId,
        action: "bank_changed",
        previousValue: `${before.bank_name ?? ""} ${maskAccount(before.account_no)}`.trim(),
        newValue: `${row.bank_name ?? ""} ${maskAccount(row.account_no)}`.trim(),
      });
    }
  } else {
    const { data, error } = await supabase.from("payment_accounts").insert(row).select("id").single();
    if (error) {
      if (error.code === "23505") throw new Error("This account already exists in the list.");
      throw error;
    }
    await logTaskAudit({ companyId: input.companyId, relatedTable: "payment_accounts", relatedId: data.id, action: "account_created", newValue: `${row.name} ${maskAccount(row.account_no)}` });
  }
  revalidatePath("/finance/payment-accounts");
}

function revalidatePaymentPaths(paymentId?: string) {
  for (const path of ["/finance/payments", "/finance/supplier-payment", "/finance/rental-payment", "/finance/utilities-payment", "/admin", "/"]) revalidatePath(path);
  if (paymentId) revalidatePath(`/finance/payments/${paymentId}`);
}

/** Checklist step before payment: Not Started (pending) <-> In Progress. Paying still goes through Mark as Paid. */
export async function setPaymentProgress(paymentId: string, progress: "pending" | "in_progress") {
  const { supabase } = await requireUser();
  const { data: current } = await supabase.from("finance_payments").select("company_id, status").eq("id", paymentId).maybeSingle();
  if (!current) throw new Error("Payment not found.");
  await requireFinanceAdmin(supabase, current.company_id);
  if (current.status === "paid") throw new Error("This payment is already paid.");
  if (current.status === progress) return;

  const { error } = await supabase.from("finance_payments").update({ status: progress }).eq("id", paymentId);
  if (error) throw error;
  await logTaskAudit({ companyId: current.company_id, relatedTable: "finance_payments", relatedId: paymentId, action: "payment_progress", previousValue: current.status, newValue: progress });
  revalidatePaymentPaths(paymentId);
  revalidatePath("/finance/payments/checklist");
}
