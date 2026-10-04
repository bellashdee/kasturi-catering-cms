import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

/**
 * Generic proof-of-work lookup — works for any module's records via
 * (relatedTable, relatedId), so Kitchen/Catering/Maintenance can reuse this
 * exactly as Operation Management does for deliveries.
 */
export async function listTaskProofs(supabase: DB, relatedTable: string, relatedId: string) {
  const { data, error } = await supabase
    .from("task_proofs")
    .select("*, documents(id, original_filename, file_type)")
    .eq("related_table", relatedTable)
    .eq("related_id", relatedId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listTaskAuditLog(supabase: DB, relatedTable: string, relatedId: string) {
  const { data, error } = await supabase
    .from("task_audit_log")
    .select("*")
    .eq("related_table", relatedTable)
    .eq("related_id", relatedId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
