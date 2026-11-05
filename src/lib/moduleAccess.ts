import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

/**
 * Whether the user may edit and delete in a module of this company: a Company Admin, or a person on the module editors list
 * (Mr. Adlan) for that module only. Until the list is in the database only the admin check applies.
 */
export async function isModuleEditor(supabase: DB, companyId: string, moduleKey: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("user_is_module_editor", { target_company_id: companyId, target_module: moduleKey });
  if (!error) return data === true;
  const { data: admin } = await supabase.rpc("user_is_company_admin", { target_company_id: companyId });
  return admin === true;
}
