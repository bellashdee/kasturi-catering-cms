import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { listSupplierInvoices } from "@/lib/procurement/queries";
import { isOverdue } from "@/lib/procurement/constants";
import { listCustomerInvoices } from "@/lib/finance/queries";
import { getCateringEvents } from "@/lib/queries/dashboard";
import { formatCurrency, todayInMalaysia, addDaysToDateIso } from "@/lib/format";

type DB = SupabaseClient<Database>;

export type LiveDataContext = {
  supabase: DB;
  targetCompanyIds: string[];
  companyLabel: string;
};

export type LiveDataIntent = {
  id: string;
  /** Cheap keyword test — deliberately simple and deterministic, not an LLM call. */
  test: (question: string) => boolean;
  /** Runs a real, RLS-scoped query and returns a short authoritative summary. */
  run: (ctx: LiveDataContext) => Promise<string>;
};

function todayIso() {
  return todayInMalaysia();
}

/**
 * Deterministic "live data" lookups the assistant can attach to its answer.
 * Every query here goes through the caller's own RLS-scoped Supabase client
 * (never a service-role client) and is filtered to `targetCompanyIds`, which
 * is derived from resolveCompanyScope() the same way every page derives it —
 * so a user can never get data for a company they don't have access to.
 */
export const LIVE_DATA_INTENTS: LiveDataIntent[] = [
  {
    id: "supplier-overdue-list",
    test: (q) => /supplier/i.test(q) && /overdue/i.test(q) && /(which|list|show|what)/i.test(q),
    run: async ({ supabase, targetCompanyIds, companyLabel }) => {
      const invoices = await listSupplierInvoices(supabase, targetCompanyIds);
      const overdue = invoices.filter((i) => isOverdue(i.due_date, i.status));
      if (overdue.length === 0) return `[Live data — ${companyLabel}] No overdue supplier invoices right now.`;
      const lines = overdue
        .slice(0, 10)
        .map((i) => `- ${i.invoice_number} — ${i.suppliers?.name ?? "Unknown supplier"} — ${formatCurrency(Number(i.amount))} (due ${i.due_date})`);
      return `[Live data — ${companyLabel}] ${overdue.length} overdue supplier invoice(s):\n${lines.join("\n")}${
        overdue.length > 10 ? `\n...and ${overdue.length - 10} more.` : ""
      }`;
    },
  },
  {
    id: "supplier-outstanding",
    test: (q) => /supplier/i.test(q) && /(outstanding|owe|unpaid)/i.test(q),
    run: async ({ supabase, targetCompanyIds, companyLabel }) => {
      const invoices = await listSupplierInvoices(supabase, targetCompanyIds);
      const outstanding = invoices.filter((i) => i.status !== "paid");
      const total = outstanding.reduce((t, i) => t + Number(i.amount), 0);
      const overdueCount = outstanding.filter((i) => isOverdue(i.due_date, i.status)).length;
      return `[Live data — ${companyLabel}] Supplier Outstanding: ${formatCurrency(total)} across ${outstanding.length} unpaid invoice(s), of which ${overdueCount} are overdue.`;
    },
  },
  {
    id: "customer-outstanding",
    test: (q) => /customer/i.test(q) && /(outstanding|owe|unpaid)/i.test(q),
    run: async ({ supabase, targetCompanyIds, companyLabel }) => {
      const invoices = await listCustomerInvoices(supabase, targetCompanyIds);
      const outstanding = invoices.filter((i) => i.status !== "paid");
      const total = outstanding.reduce((t, i) => t + Number(i.amount), 0);
      const overdueCount = outstanding.filter((i) => i.due_date < todayIso()).length;
      return `[Live data — ${companyLabel}] Customer Outstanding: ${formatCurrency(total)} across ${outstanding.length} unpaid invoice(s), of which ${overdueCount} are overdue.`;
    },
  },
  {
    id: "upcoming-catering-events",
    test: (q) => /(catering event|upcoming event)/i.test(q) && /(week|coming|upcoming|how many|schedule)/i.test(q),
    run: async ({ supabase, targetCompanyIds, companyLabel }) => {
      const { upcomingCount, upcoming } = await getCateringEvents(supabase, targetCompanyIds);
      if (upcomingCount === 0) return `[Live data — ${companyLabel}] No catering events scheduled in the next 14 days.`;
      const lines = upcoming.map((e) => `- ${e.event_name} — ${e.event_date} (${e.pax_count ?? "?"} pax)`);
      return `[Live data — ${companyLabel}] ${upcomingCount} catering event(s) in the next 14 days:\n${lines.join("\n")}`;
    },
  },
  {
    id: "expiring-certificates",
    test: (q) => /(certificate|cert)/i.test(q) && /expir/i.test(q),
    run: async ({ supabase, targetCompanyIds, companyLabel }) => {
      const in30 = addDaysToDateIso(todayInMalaysia(), 30);
      const { data, error } = await supabase
        .from("employee_certificates")
        .select("cert_name, expiry_date, employees(full_name)")
        .in("company_id", targetCompanyIds)
        .not("expiry_date", "is", null)
        .lte("expiry_date", in30)
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return `[Live data — ${companyLabel}] No staff certificates are expiring in the next 30 days.`;
      const lines = rows.slice(0, 10).map((r) => `- ${r.employees?.full_name ?? "Unknown"} — ${r.cert_name} expires ${r.expiry_date}`);
      return `[Live data — ${companyLabel}] ${rows.length} certificate(s) expiring within 30 days:\n${lines.join("\n")}${
        rows.length > 10 ? `\n...and ${rows.length - 10} more.` : ""
      }`;
    },
  },
];

export function matchLiveDataIntent(question: string): LiveDataIntent | null {
  return LIVE_DATA_INTENTS.find((intent) => intent.test(question)) ?? null;
}
