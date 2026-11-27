import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { MutationLog } from "./core";

/** The table is not there yet (the migration is not applied): the sync still works, it only keeps no record of the changes. */
const missingTable = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "42P01" || error.code === "PGRST205" || /could not find the table/i.test(error.message ?? ""));

let warned = false;
function warnMissing() {
  if (warned) return;
  warned = true;
  console.warn("offline sync: offline_mutations / sync_conflicts are missing; apply supabase/migrations/20261128000001_offline_sync.sql");
}

/** offline_mutations and sync_conflicts, written as the signed-in person (RLS: only their own rows). */
export function databaseLog(supabase: SupabaseClient<Database>, userId: string): MutationLog {
  return {
    async get(id) {
      const { data, error } = await supabase.from("offline_mutations").select("status, result, user_id").eq("id", id).maybeSingle();
      if (missingTable(error)) {
        warnMissing();
        return null;
      }
      if (error) throw error;
      return data ? { status: data.status, result: data.result, userId: data.user_id } : null;
    },
    async save({ mutation, status, result }) {
      const { error } = await supabase.from("offline_mutations").upsert({
        id: mutation.id,
        user_id: userId,
        device_id: mutation.deviceId.slice(0, 100),
        op: mutation.op,
        status,
        result: result as Json,
        client_created_at: mutation.createdAt || null,
      });
      if (missingTable(error)) return warnMissing();
      // the change itself is saved; failing to note it is not a reason to apply it again (the handlers are idempotent anyway)
      if (error) console.warn("offline sync: could not record mutation", mutation.id, error.message);
    },
    async saveConflict({ mutation, table, serverVersion }) {
      const { error } = await supabase.from("sync_conflicts").upsert(
        {
          mutation_id: mutation.id,
          user_id: userId,
          device_id: mutation.deviceId.slice(0, 100),
          op: mutation.op,
          table_name: table,
          record_id: mutation.recordId,
          company_id: mutation.companyId,
          local_version: { payload: mutation.payload, made_at: mutation.createdAt } as Json,
          base_version: (mutation.base ?? null) as Json,
          server_version: (serverVersion ?? null) as Json,
        },
        { onConflict: "mutation_id" },
      );
      if (missingTable(error)) return warnMissing();
      if (error) console.warn("offline sync: could not record conflict", mutation.id, error.message);
    },
  };
}

/** The person's choice on a conflict (both versions stay in the table). */
export async function resolveConflict(supabase: SupabaseClient<Database>, userId: string, mutationId: string, resolution: "kept_mine" | "kept_server") {
  const { error } = await supabase
    .from("sync_conflicts")
    .update({ resolution, resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("mutation_id", mutationId)
    .eq("user_id", userId);
  if (error && !missingTable(error)) throw error;
}
