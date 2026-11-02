import { createAdminClient } from "@/lib/supabase/admin";
import { modulesForPositions } from "@/lib/positionAccess";

/**
 * Sets the modules of a login from the position(s) on their staff records (see positionAccess). A Super Admin is never changed, and a
 * position with no rule leaves the access as it is. Called when a staff position (or the login linked to it) is changed in HR.
 * A failure is written to the server log and never turns the saved staff record into an error.
 */
export async function syncModulesFromPosition(userId: string | null | undefined) {
  if (!userId) return;
  try {
    const admin = createAdminClient();
    const { data: records } = await admin.from("employees").select("position").eq("user_id", userId).eq("status", "active");
    const next = modulesForPositions((records ?? []).map((r) => r.position));
    if (next === undefined) return;
    const { error } = await admin.from("user_company_access").update({ allowed_modules: next }).eq("user_id", userId).neq("role", "super_admin");
    if (error) throw error;
  } catch (err) {
    console.warn("Modules could not be set from the position:", userId, err instanceof Error ? err.message : err);
  }
}
