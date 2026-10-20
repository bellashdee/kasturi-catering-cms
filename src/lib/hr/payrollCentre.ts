import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export const PAYMENT_METHODS = ["Bank transfer", "Cash", "Cheque", "Other"] as const;

export type PayrollLine = {
  employeeId: string;
  companyId: string;
  companyName: string;
  fullName: string;
  position: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  epfNo: string | null;
  /** The month's payroll record, when the Finance team has entered one. */
  recordId: string | null;
  grossPay: number | null;
  deductions: number | null;
  netPay: number | null;
  status: "none" | "draft" | "paid";
  paidOn: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  remarks: string | null;
};

/** "YYYY-MM" → first and last day of that month. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function isValidMonth(value: string | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Every active staff record of the given companies for one month, with the bank details (admins only, enforced by the database) and the
 * month's payroll record. Nothing is estimated: a person with no payroll record for the month is "none" until Finance enters the figures.
 */
export async function loadPayrollLines(supabase: DB, companyIds: string[], month: string): Promise<PayrollLine[]> {
  if (companyIds.length === 0) return [];
  const { start } = monthRange(month);
  const [{ data: employees, error: e1 }, { data: records, error: e2 }, { data: priv, error: e3 }] = await Promise.all([
    supabase.from("employees").select("id, company_id, full_name, position, status, companies(name)").in("company_id", companyIds).order("full_name"),
    supabase.from("payroll_records").select("*").in("company_id", companyIds).eq("pay_period_start", start),
    supabase.from("employee_private_details").select("employee_id, bank_name, bank_account_no, epf_no").in("company_id", companyIds),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  const recordByEmployee = new Map((records ?? []).map((r) => [r.employee_id, r]));
  const privateByEmployee = new Map((priv ?? []).map((p) => [p.employee_id, p]));
  const lines: PayrollLine[] = [];
  for (const e of employees ?? []) {
    const r = recordByEmployee.get(e.id);
    // staff who left stay on the list only when they have a record for this month
    if (e.status !== "active" && !r) continue;
    const p = privateByEmployee.get(e.id);
    lines.push({
      employeeId: e.id,
      companyId: e.company_id,
      companyName: e.companies?.name ?? "",
      fullName: e.full_name,
      position: e.position,
      bankName: p?.bank_name ?? null,
      bankAccountNo: p?.bank_account_no ?? null,
      epfNo: p?.epf_no ?? null,
      recordId: r?.id ?? null,
      grossPay: r ? Number(r.gross_pay) : null,
      deductions: r ? Number(r.deductions) : null,
      netPay: r ? Number(r.net_pay) : null,
      status: r ? (r.status === "paid" ? "paid" : "draft") : "none",
      paidOn: r?.paid_on ?? null,
      paymentMethod: r?.payment_method ?? null,
      paymentReference: r?.payment_reference ?? null,
      remarks: r?.remarks ?? null,
    });
  }
  return lines.sort((a, b) => a.companyName.localeCompare(b.companyName) || a.fullName.localeCompare(b.fullName));
}

export type PayrollSummary = {
  staff: number;
  /** Staff with no figures entered for the month yet. */
  notEntered: number;
  drafts: number;
  paidCount: number;
  totalNet: number;
  paidNet: number;
  outstandingNet: number;
  missingBank: number;
};

export function summarisePayroll(lines: PayrollLine[]): PayrollSummary {
  const s: PayrollSummary = { staff: lines.length, notEntered: 0, drafts: 0, paidCount: 0, totalNet: 0, paidNet: 0, outstandingNet: 0, missingBank: 0 };
  for (const l of lines) {
    if (!l.bankName || !l.bankAccountNo) s.missingBank++;
    if (l.status === "none") {
      s.notEntered++;
      continue;
    }
    const net = l.netPay ?? 0;
    s.totalNet += net;
    if (l.status === "paid") {
      s.paidCount++;
      s.paidNet += net;
    } else {
      s.drafts++;
      s.outstandingNet += net;
    }
  }
  return s;
}
