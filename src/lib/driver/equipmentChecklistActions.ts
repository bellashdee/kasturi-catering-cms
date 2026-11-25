"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { canAccessModule } from "@/lib/modules";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { SIGNATURES, type ChecklistItem, type SignatureKey } from "@/lib/driver/equipmentChecklist";

async function guard() {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  if (!canAccessModule(session.allowedModules, "driver-logistics")) throw new Error("You do not have access to Operation Management.");
  return { session, supabase: await createClient() };
}

const pcs = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(100000, Math.round(Number(v)))));

/** Saves the counts (Out / In pieces) and notes of one event's equipment checklist. */
export async function saveEquipmentChecklist(input: { eventId: string; items: ChecklistItem[]; notes: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { session, supabase } = await guard();
    const { data: event } = await supabase.from("catering_events").select("id, company_id").eq("id", input.eventId).maybeSingle();
    if (!event) throw new Error("Event not found.");
    const seen = new Set<string>();
    const items = input.items
      .map((i) => ({ name: i.name.trim().slice(0, 100), side: i.side === "right" ? "right" : "left", out: pcs(i.out), in: pcs(i.in) }))
      .filter((i) => {
        const key = i.name.toLowerCase();
        if (!i.name || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const { error } = await untyped(supabase)
      .from("equipment_checklists")
      .upsert(
        { company_id: event.company_id, catering_event_id: event.id, items, notes: input.notes.trim() || null, updated_by: session.userId, updated_at: new Date().toISOString() },
        { onConflict: "catering_event_id" },
      );
    if (error) throw error;
    revalidatePath("/driver-logistics/equipment");
    revalidatePath(`/driver-logistics/equipment/${event.id}`);
    return {};
  }, "Could not save the checklist. Please try again.");
}

/** Signs (or removes the signature of) one of the four boxes: Prepared / Checked (out), Received / Checked (in). */
export async function signEquipmentChecklist(eventId: string, key: SignatureKey, sign: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const { session, supabase } = await guard();
    if (!SIGNATURES.some((s) => s.key === key)) throw new Error("Unknown signature.");
    const db = untyped(supabase);
    const { data: row } = await db.from("equipment_checklists").select("id, out_prepared_by, out_checked_by, in_received_by, in_checked_by").eq("catering_event_id", eventId).maybeSingle();
    if (!row) throw new Error("Save the checklist first, then sign it.");
    const current = (row as Record<string, string | null>)[`${key}_by`];
    if (!sign && current && current !== session.userId) {
      const { data: isSuper } = await supabase.rpc("current_user_is_super_admin");
      if (isSuper !== true) throw new Error("Only the person who signed (or a Super Admin) can remove this signature.");
    }
    const { error } = await db
      .from("equipment_checklists")
      .update({ [`${key}_by`]: sign ? session.userId : null, [`${key}_at`]: sign ? new Date().toISOString() : null })
      .eq("id", (row as { id: string }).id);
    if (error) throw error;
    revalidatePath("/driver-logistics/equipment");
    revalidatePath(`/driver-logistics/equipment/${eventId}`);
    return {};
  }, "Could not save the signature.");
}
