"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { loadSupplierLedgers, monthBounds, type LedgerReport, type LedgerSort, type LedgerTotals } from "@/lib/finance/supplierLedger";

const hasActivity = (t: LedgerTotals) => [t.opening, t.invoices, t.debitNotes, t.creditNotes, t.payments, t.allocated, t.closing].some((v) => Math.abs(v) >= 0.005);

/**
 * The SOA report for the Excel / PDF buttons, read only when a button is pressed (the page itself does not carry a second copy of every
 * transaction, so it opens faster). The same filters and the same company access as the page.
 */
export async function loadSoaReportForExport(params: { company: string | null; supplierId: string | null; year: number; month: number; sort: LedgerSort; onlyActive: boolean }): Promise<ActionResult<{ report: LedgerReport }>> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Not signed in.");
    const supabase = await createClient();
    const { data: companies } = await supabase.from("companies").select("id, name");
    const { targetCompanyIds } = resolveCompanyScope(session, companies ?? [], params.company ?? undefined);
    const { start, end } = monthBounds(params.year, params.month);
    const report = await loadSupplierLedgers(supabase, { companyIds: targetCompanyIds, supplierId: params.supplierId, periodStart: start, periodEnd: end, sort: params.sort });
    if (params.onlyActive) report.companies = report.companies.map((c) => ({ ...c, suppliers: c.suppliers.filter((s) => hasActivity(s.totals) || s.lines.length > 0) }));
    return { report };
  }, "Could not prepare the report. Please try again.");
}
