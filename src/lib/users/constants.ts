import type { Database } from "@/lib/supabase/types";

export const ROLE_LABEL: Record<Database["public"]["Enums"]["user_role"], string> = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  dept_manager: "Department Manager",
  staff: "Staff",
};
