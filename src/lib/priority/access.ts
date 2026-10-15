import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SessionContext } from "@/lib/auth";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";

type DB = SupabaseClient<Database>;

export type PriorityAccess = {
  userId: string;
  /** Madam Penny's level: may approve or reject payment requests (Super Admin). */
  isApprover: boolean;
  /** Companies where the person is Super Admin or Company Admin (Finance / Admin): payments and every task of these companies. */
  adminCompanyIds: string[];
  /** Every company the person can open (tasks assigned to them are visible even where they are not an admin). */
  companyIds: string[];
  canSeePayments: boolean;
};

export async function getPriorityAccess(supabase: DB, session: SessionContext, accessibleIds: string[]): Promise<PriorityAccess> {
  const [{ data: isSuper }, admins] = await Promise.all([supabase.rpc("current_user_is_super_admin"), adminCompanyIds(supabase, accessibleIds)]);
  return {
    userId: session.userId,
    isApprover: isSuper === true,
    adminCompanyIds: admins,
    companyIds: accessibleIds,
    canSeePayments: admins.length > 0,
  };
}

/** For server actions: the signed-in user and the checks above, read fresh from the database. */
export async function requireCompanyAdmin(supabase: DB, companyId: string): Promise<void> {
  const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: companyId });
  if (data !== true) throw new Error("Only Finance / Admin users of this company can do this.");
}

export async function requireApprover(supabase: DB): Promise<void> {
  const { data } = await supabase.rpc("current_user_is_super_admin");
  if (data !== true) throw new Error("Only Madam Penny (Super Admin) can approve or reject a payment request.");
}
