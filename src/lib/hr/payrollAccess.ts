import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Payroll is private and confidential: only the Director of Finance and her personal assistant (the people listed in
 * payroll_centre_access) may see or change it. The database enforces the same rule on the payroll records.
 */
export async function canUsePayrollCentre(supabase: SupabaseClient<Database>): Promise<boolean> {
  const { data } = await supabase.rpc("user_can_use_payroll_centre");
  return data === true;
}

export async function requirePayrollAccess(supabase: SupabaseClient<Database>): Promise<void> {
  if (!(await canUsePayrollCentre(supabase))) throw new Error("Payroll is private. Only the Director of Finance and her personal assistant can open it.");
}
