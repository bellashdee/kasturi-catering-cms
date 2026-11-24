import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** The staff records linked to the signed-in login (one per company), and the one chosen with ?record= (the first one otherwise). */
export async function getOwnEmployee(supabase: SupabaseClient<Database>, userId: string, record?: string) {
  const { data } = await supabase.from("employees").select("id, company_id, full_name, position, department, join_date, companies(name)").eq("user_id", userId).order("full_name");
  const records = data ?? [];
  const employee = records.find((e) => e.id === record) ?? records[0] ?? null;
  return { records, employee };
}
