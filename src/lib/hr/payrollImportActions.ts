"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePayrollAccess } from "@/lib/hr/payrollAccess";
import { savePayrollEntry } from "@/lib/hr/payrollCentreActions";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { monthRange } from "@/lib/hr/payrollCentre";
import { untyped } from "@/lib/kitchenPurchase/shared";

export type PayrollImportLine = { employeeId: string; companyId: string; grossPay: number; deductions: number; basic: number | null; remarks?: string };

/**
 * Saves the imported payslips of one month: each line goes through the same checks as keying in one salary in the Payroll Centre
 * (a salary already paid is not changed). The basic salary on the payslip is also kept with the month's payroll record, so the system knows
 * who earns RM4,000 and above (no OT for them; they use Claim Hours instead).
 */
export async function importPayrollEntries(month: string, lines: PayrollImportLine[]): Promise<ActionResult<{ saved: number; failed: { employeeId: string; error: string }[] }>> {
  return runAction(async () => {
    const supabase = await createClient();
    await requirePayrollAccess(supabase);
    if (lines.length === 0) throw new Error("There is nothing to save.");
    if (lines.length > 500) throw new Error("Import at most 500 payslips at a time.");
    let saved = 0;
    const failed: { employeeId: string; error: string }[] = [];
    for (const line of lines) {
      const res = await savePayrollEntry({ employeeId: line.employeeId, companyId: line.companyId, month, grossPay: line.grossPay, deductions: line.deductions, remarks: line.remarks ?? "Imported from payslip" });
      if (!res.ok) {
        failed.push({ employeeId: line.employeeId, error: res.error });
        continue;
      }
      saved++;
      if (line.basic !== null && Number.isFinite(line.basic) && line.basic > 0) {
        await untyped(supabase)
          .from("payroll_records")
          .update({ basic_pay: Math.round(line.basic * 100) / 100 })
          .eq("employee_id", line.employeeId)
          .eq("pay_period_start", monthRange(month).start);
      }
    }
    revalidatePath("/payroll-centre");
    return { saved, failed };
  }, "Could not save the imported payslips.");
}
