import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * A delivery can only be assigned to an active internal driver record or an active external
 * delivery vendor of the same company, and never to both. Nothing typed by the user is trusted.
 */
export async function assertValidAssignee(
  supabase: SupabaseClient<Database>,
  companyId: string,
  driverId?: string | null,
  vendorId?: string | null,
) {
  if (driverId && vendorId) throw new Error("Choose either a driver or a delivery vendor, not both.");

  if (driverId) {
    const { data } = await supabase
      .from("driver_profiles")
      .select("id, employees!inner(status)")
      .eq("company_id", companyId)
      .eq("employee_id", driverId)
      .maybeSingle();
    if (!data || data.employees?.status !== "active") throw new Error("Select a driver from the list.");
  }

  if (vendorId) {
    const { data } = await supabase.from("delivery_vendors").select("id").eq("company_id", companyId).eq("id", vendorId).eq("is_active", true).maybeSingle();
    if (!data) throw new Error("Select a delivery person from the list.");
  }
}
