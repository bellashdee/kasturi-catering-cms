import { isModuleEditor } from "@/lib/moduleAccess";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { periodStart, type PaymentCategory } from "@/lib/finance/payments";

type DB = SupabaseClient<Database>;

/** Companies (of those given) where the signed-in user is an admin; only these may see payments and bank details. */
export async function adminCompanyIds(supabase: DB, companyIds: string[], moduleKey?: string): Promise<string[]> {
  const flags = await Promise.all(
    companyIds.map(async (id) => {
      // with a module, a person on that module's editors list counts as well (Mr. Adlan)
      if (moduleKey) return [id, await isModuleEditor(supabase, id, moduleKey)] as const;
      const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: id });
      return [id, data === true] as const;
    }),
  );
  return flags.filter(([, ok]) => ok).map(([id]) => id);
}

/** Companies (of those given) where the user may manage payments of this category: Finance / Admin, or a supplier payment editor for supplier payments. */
export async function paymentCompanyIds(supabase: DB, companyIds: string[], category: PaymentCategory): Promise<string[]> {
  const flags = await Promise.all(
    companyIds.map(async (id) => {
      let { data, error } = await supabase.rpc("user_can_manage_payments", { target_company_id: id, target_category: category });
      if (error) ({ data } = await supabase.rpc("user_is_company_admin", { target_company_id: id }));
      return [id, data === true] as const;
    }),
  );
  return flags.filter(([, ok]) => ok).map(([id]) => id);
}

export async function listPaymentAccounts(supabase: DB, companyIds: string[], category?: PaymentCategory, includeInactive = false) {
  let query = supabase.from("payment_accounts").select("*, companies(name)").in("company_id", companyIds).order("name");
  if (category) query = query.eq("category", category);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * What has been paid so far on each payment: the supplier payment ledger (part payments recorded in Finance, and payments
 * confirmed in the Priority Centre). A payment that is not in the ledger has nothing paid yet.
 */
export async function paidSoFar(supabase: DB, paymentIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; i < paymentIds.length; i += 200) {
    const { data } = await supabase.from("supplier_payments").select("finance_payment_id, amount").eq("status", "paid").in("finance_payment_id", paymentIds.slice(i, i + 200));
    for (const r of data ?? []) if (r.finance_payment_id) map.set(r.finance_payment_id, round2((map.get(r.finance_payment_id) ?? 0) + Number(r.amount)));
  }
  return map;
}

/** The rows with `paid_so_far` added (only payments that are not fully paid can have a balance). */
async function withPaid<T extends { id: string; status: string }>(supabase: DB, rows: T[]) {
  const unpaid = rows.filter((r) => r.status !== "paid").map((r) => r.id);
  const paid = unpaid.length > 0 ? await paidSoFar(supabase, unpaid) : new Map<string, number>();
  return rows.map((r) => ({ ...r, paid_so_far: paid.get(r.id) ?? 0 }));
}

/** The part payments (and the final one) made on one payment, oldest first. */
export async function listPartPayments(supabase: DB, paymentId: string) {
  const { data, error } = await supabase
    .from("supplier_payments")
    .select("id, amount, payment_date, reference_number, notes, receipt_document_id, created_at")
    .eq("finance_payment_id", paymentId)
    .eq("status", "paid")
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type PaymentFilters = {
  category?: PaymentCategory;
  provider?: string;
  payee?: string;
};

/**
 * All payments of the month (by payment month), earliest due date first. `month` 0 means every month of the year.
 * Status filtering is done by the caller (urgency is date based).
 */
export async function listPaymentsForMonth(supabase: DB, companyIds: string[], year: number, month: number, filters: PaymentFilters = {}) {
  let query = supabase
    .from("finance_payments")
    .select("*, companies(name)")
    .in("company_id", companyIds)
    .neq("status", "cancelled")
    .order("due_date", { ascending: true })
    .order("payee_name");
  query = month === 0 ? query.gte("period_month", periodStart(year, 1)).lte("period_month", periodStart(year, 12)) : query.eq("period_month", periodStart(year, month));
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.provider) query = query.eq("utility_provider", filters.provider);
  if (filters.payee) query = query.ilike("payee_name", `%${filters.payee}%`);
  const { data, error } = await query;
  if (error) throw error;
  return withPaid(supabase, data ?? []);
}

export async function getPayment(supabase: DB, id: string) {
  const { data, error } = await supabase.from("finance_payments").select("*, companies(name)").eq("id", id).single();
  if (error) throw error;
  return data;
}

/** Every unpaid payment that is overdue or due on/before the given date, across months (for reminders and alerts). */
export async function listUnpaidDueBy(supabase: DB, companyIds: string[], dueOnOrBefore: string) {
  const { data, error } = await supabase
    .from("finance_payments")
    .select("id, company_id, category, payee_name, utility_provider, utility_location, amount, due_date, period_month, companies(name)")
    .in("company_id", companyIds)
    .not("status", "in", "(paid,cancelled)")
    .lte("due_date", dueOnOrBefore)
    .order("due_date");
  if (error) throw error;
  return data;
}

/** Audit trail for a payment (or account), newest first, with the name of whoever acted. */
export async function listFinanceAudit(supabase: DB, relatedTable: "finance_payments" | "payment_accounts", id: string) {
  const { data, error } = await supabase
    .from("task_audit_log")
    .select("*")
    .eq("related_table", relatedTable)
    .eq("related_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ids = Array.from(new Set((data ?? []).map((r) => r.performed_by).filter((x): x is string => !!x)));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }
  return (data ?? []).map((r) => ({ ...r, performerName: r.performed_by ? names.get(r.performed_by) ?? null : null }));
}

/** Payments for the checklist: every month unless one is given, paid and unpaid, so progress can be scored. */
export async function listPaymentsForChecklist(supabase: DB, companyIds: string[], filters: { year?: number; month?: number; category?: PaymentCategory } = {}) {
  let query = supabase.from("finance_payments").select("*, companies(name)").in("company_id", companyIds).neq("status", "cancelled").order("period_month", { ascending: true }).order("payee_name");
  if (filters.year && filters.month) query = query.eq("period_month", periodStart(filters.year, filters.month));
  if (filters.category) query = query.eq("category", filters.category);
  const { data, error } = await query;
  if (error) throw error;
  return withPaid(supabase, data ?? []);
}
