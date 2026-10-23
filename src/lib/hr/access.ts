import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SessionContext } from "@/lib/auth";
import { companiesWhereUser } from "@/lib/hr/otStaff";

type DB = SupabaseClient<Database>;

/**
 * Who may see which staff record in the HR section. A Super Admin or Company Admin sees every employee of the company. Everyone
 * else (for example a department manager who has the HR module) sees only the staff record linked to their own login: no list of
 * other staff and none of their details.
 */
export type HrAccess = {
  adminCompanyIds: Set<string>;
  ownEmployeeIds: Set<string>;
  /** an admin of at least one of the companies in scope */
  adminAnywhere: boolean;
  isAdminOf: (companyId: string) => boolean;
  /** the signed-in person may open this staff record */
  canSee: (employee: { id: string; company_id: string }) => boolean;
};

export async function getHrAccess(supabase: DB, session: SessionContext, companyIds: string[]): Promise<HrAccess> {
  const [adminCompanyIds, { data: own }] = await Promise.all([
    companiesWhereUser(supabase, companyIds, "user_is_company_admin"),
    supabase.from("employees").select("id").eq("user_id", session.userId),
  ]);
  const ownEmployeeIds = new Set((own ?? []).map((e) => e.id));
  return {
    adminCompanyIds,
    ownEmployeeIds,
    adminAnywhere: adminCompanyIds.size > 0,
    isAdminOf: (companyId) => adminCompanyIds.has(companyId),
    canSee: (e) => adminCompanyIds.has(e.company_id) || ownEmployeeIds.has(e.id),
  };
}
