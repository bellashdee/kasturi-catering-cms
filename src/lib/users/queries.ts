import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listMembers(supabase: DB) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, email, is_active, created_at, user_company_access(id, role, company_id, companies(name))")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}
