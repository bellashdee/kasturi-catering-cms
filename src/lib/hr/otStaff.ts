import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { OtStaffOption } from "@/components/hr/OvertimeForm";

type DB = SupabaseClient<Database>;

/** Companies (of those given) where the signed-in user is an admin or a manager. */
export async function companiesWhereUser(supabase: DB, companyIds: string[], fn: "user_is_company_admin" | "user_is_ot_manager"): Promise<Set<string>> {
  const flags = await Promise.all(
    companyIds.map(async (id) => {
      const { data } = await supabase.rpc(fn, { target_company_id: id });
      return [id, data === true] as const;
    }),
  );
  return new Set(flags.filter(([, ok]) => ok).map(([id]) => id));
}

/**
 * The names offered in "Select Staff Name": staff of the central Staff Database. An admin of a company sees all of
 * its active staff; everyone else sees only the record linked to their own login.
 */
export async function listOtStaffOptions(supabase: DB, companyIds: string[], userId: string): Promise<OtStaffOption[]> {
  const [{ data: employees }, adminCompanies] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, company_id, department, position, user_id, companies(name)")
      .in("company_id", companyIds)
      .eq("status", "active")
      .order("full_name"),
    companiesWhereUser(supabase, companyIds, "user_is_company_admin"),
  ]);

  return (employees ?? [])
    .filter((e) => adminCompanies.has(e.company_id) || e.user_id === userId)
    .map((e) => ({
      id: e.id,
      name: e.full_name,
      companyId: e.company_id,
      companyName: e.companies?.name ?? "",
      department: e.department,
      position: e.position,
    }));
}
