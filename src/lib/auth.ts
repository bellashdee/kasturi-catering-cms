import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { mergeAllowedModules } from "@/lib/modules";
import type { Database } from "@/lib/supabase/types";

type AccessRow = Database["public"]["Tables"]["user_company_access"]["Row"];

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string;
  /** Highest role the user holds anywhere (drives what we show, not full enforcement yet). */
  role: Database["public"]["Enums"]["user_role"];
  /** true if the user has a company_id = null grant, i.e. access to every company. */
  hasAllCompaniesAccess: boolean;
  /** Company ids the user can see (only meaningful when hasAllCompaniesAccess is false). */
  companyIds: string[];
  /** Modules the user may open; null = every module. */
  allowedModules: string[] | null;
};

const ROLE_RANK: Record<Database["public"]["Enums"]["user_role"], number> = {
  super_admin: 3,
  company_admin: 2,
  dept_manager: 1,
  staff: 0,
};

/**
 * Reads the signed-in user's profile and company access grants.
 * Returns null when there is no session (proxy.ts should already have redirected,
 * but pages call this too since proxy is only an optimistic check).
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
    supabase.from("user_company_access").select("*").eq("user_id", user.id),
  ]);

  const rows: AccessRow[] = access ?? [];
  const hasAllCompaniesAccess = rows.some((r) => r.company_id === null);
  const companyIds = rows.filter((r) => r.company_id !== null).map((r) => r.company_id as string);
  const role = rows.reduce<Database["public"]["Enums"]["user_role"]>(
    (best, r) => (ROLE_RANK[r.role] > ROLE_RANK[best] ? r.role : best),
    "staff",
  );

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name ?? user.email ?? "Unknown",
    role,
    hasAllCompaniesAccess,
    companyIds,
    allowedModules: mergeAllowedModules(rows.map((r) => r.allowed_modules)),
  };
});

export { ROLE_LABEL } from "@/lib/users/constants";
