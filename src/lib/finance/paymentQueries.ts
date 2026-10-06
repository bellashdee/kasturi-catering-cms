import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { periodStart, type PaymentCategory } from "@/lib/finance/payments";

type DB = SupabaseClient<Database>;

/** Companies (of those given) where the signed-in user is an admin; only these may see payments and bank details. */
export async function adminCompanyIds(supabase: DB, companyIds: string[]): Promise<string[]> {
  const flags = await Promise.all(
    companyIds.map(async (id) => {
      const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: id });
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

export type PaymentFilters = {
  category?: PaymentCategory;
  provider?: string;
  payee?: string;
};

/** All payments of the month (by payment month), newest due date first. Status filtering is done by the caller (urgency is date based). */
export async function listPaymentsForMonth(supabase: DB, companyIds: string[], year: number, month: number, filters: PaymentFilters = {}) {
  let query = supabase
    .from("finance_payments")
    .select("*, companies(name)")
    .in("company_id", companyIds)
    .eq("period_month", periodStart(year, month))
    .order("due_date", { ascending: true })
    .order("payee_name");
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.provider) query = query.eq("utility_provider", filters.provider);
  if (filters.payee) query = query.ilike("payee_name", `%${filters.payee}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
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
    .eq("status", "pending")
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
