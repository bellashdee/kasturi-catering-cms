"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { locationKey, parseCoordinates } from "@/lib/eventAttendance/rules";

/**
 * An admin sets or corrects where an event location is on the map (pasted coordinates or a Google Maps link, or the admin's
 * own position when standing at the venue). People clocking in are measured against this point.
 */
export async function saveEventSite(input: { companyId: string; locationText: string; coordinates: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: isAdmin } = await supabase.rpc("user_is_company_admin", { target_company_id: input.companyId });
  if (isAdmin !== true) throw new Error("Only an admin can set the event location on the map.");
  const text = input.locationText.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Write the event location.");
  const point = parseCoordinates(input.coordinates);
  if (!point) throw new Error("Paste the coordinates (for example 1.4927, 103.7414) or a Google Maps link that shows them.");

  const key = locationKey(text);
  const { data, error } = await supabase
    .from("event_sites")
    .upsert({ company_id: input.companyId, location_key: key, location_text: text, latitude: point.latitude, longitude: point.longitude, source: "admin", updated_by: user.id }, { onConflict: "company_id,location_key" })
    .select("id")
    .single();
  if (error) throw error;
  await recordAudit({ companyId: input.companyId, relatedTable: "event_sites", relatedId: data.id, action: "event_location_set", newValue: `${text} → ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}` });
  revalidatePath("/driver-logistics/attendance");
}
