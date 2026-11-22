import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, type SessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { isRestaurantScope } from "@/lib/restaurantView";
import { canAccessModule } from "@/lib/modules";
import { MANAGER_ROLES, MODULE_KEY, SALES_ROLES } from "@/lib/restaurant/constants";

export type RestaurantContext = {
  session: SessionContext;
  /** The Supabase client of the signed-in person, untyped (the restaurant tables are not in the generated types yet). */
  db: SupabaseClient;
  company: { id: string; name: string };
  isAdmin: boolean;
  roles: string[];
  can: { sell: boolean; manage: boolean; roles: boolean };
  /** "?company=<id>" or "" so links keep the company that is viewed */
  query: string;
  requestedCompany: string | undefined;
};

/**
 * The signed-in person, the restaurant company and what they may do. Returns null when O2 Life is not the only company being viewed
 * (the restaurant pages exist for O2 Life only); a person without the Restaurant module is sent to the home page.
 * The database decides in the end (row level security and the triggers): these flags only decide what the screen offers.
 */
export async function getRestaurantContext(requestedCompany?: string): Promise<RestaurantContext | null> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (!canAccessModule(session.allowedModules, MODULE_KEY)) redirect("/?denied=1");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedCompany);
  if (!isRestaurantScope(companies, targetCompanyIds)) return null;

  const company = companies.find((c) => c.id === targetCompanyIds[0])!;
  const db = supabase as unknown as SupabaseClient;
  const [{ data: admin }, { data: mine }] = await Promise.all([
    db.rpc("user_is_company_admin", { target_company_id: company.id }),
    db.from("rst_staff_roles").select("role").eq("user_id", session.userId).eq("company_id", company.id),
  ]);
  const isAdmin = admin === true;
  const roles = ((mine ?? []) as { role: string }[]).map((r) => r.role);
  const has = (list: string[]) => isAdmin || roles.some((r) => list.includes(r));
  return {
    session,
    db,
    company,
    isAdmin,
    roles,
    can: { sell: has(SALES_ROLES), manage: has(MANAGER_ROLES), roles: isAdmin },
    query: requestedCompany ? `?company=${requestedCompany}` : "",
    requestedCompany,
  };
}
