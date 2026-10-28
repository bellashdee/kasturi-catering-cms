import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SessionContext } from "@/lib/auth";

type DB = SupabaseClient<Database>;

/**
 * Who may see which staff record in the HR section. Only the Super Admins (Madam Penny and Nabilah) see and change the staff
 * records of every company. Everyone else (a company admin, a department manager ...) sees only the staff record linked to their own
 * login: no list of other staff and none of their details.
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
  const [{ data: isSuper }, { data: own }] = await Promise.all([
    supabase.rpc("current_user_is_super_admin"),
    supabase.from("employees").select("id").eq("user_id", session.userId),
  ]);
  const adminCompanyIds = new Set<string>(isSuper === true ? companyIds : []);
  const ownEmployeeIds = new Set((own ?? []).map((e) => e.id));
  return {
    adminCompanyIds,
    ownEmployeeIds,
    adminAnywhere: adminCompanyIds.size > 0,
    isAdminOf: (companyId) => adminCompanyIds.has(companyId),
    canSee: (e) => adminCompanyIds.has(e.company_id) || ownEmployeeIds.has(e.id),
  };
}
