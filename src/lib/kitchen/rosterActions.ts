"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { daysOfMonth, type RosterRow } from "@/lib/kitchen/roster";

export type SaveRosterInput = {
  companyId: string;
  kitchen: string;
  /** YYYY-MM */
  month: string;
  publicHolidays: number[];
  notes: string;
  rows: RosterRow[];
};

async function editor() {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  const supabase = await createClient();
  const { data: can } = await untyped(supabase).rpc("user_can_edit_kitchen_roster");
  if (can !== true) throw new Error("Only Chef Atiq or a Super Admin can change the duty roster.");
  return { supabase, session };
}

/** Saves the whole roster of one month (all rows and all days). Saving again after approval clears the approval. */
export async function saveRoster(input: SaveRosterInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, session } = await editor();
    if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error("Choose a month.");
    const kitchen = input.kitchen.trim().toUpperCase().slice(0, 60);
    if (!kitchen) throw new Error("Enter the kitchen name (for example KILANG 1).");
    const days = daysOfMonth(input.month).length;
    const rows = input.rows
      .map((r) => ({ ...r, displayName: r.displayName.trim().toUpperCase().slice(0, 80) }))
      .filter((r) => r.displayName);
    if (rows.length === 0) throw new Error("Add at least one staff member to the roster.");
    const names = new Set<string>();
    for (const r of rows) {
      if (names.has(r.displayName)) throw new Error(`${r.displayName} is on the roster twice.`);
      names.add(r.displayName);
    }

    const db = untyped(supabase);
    const month = `${input.month}-01`;
    const { data: saved, error } = await db
      .from("kitchen_rosters")
      .upsert(
        {
          company_id: input.companyId,
          kitchen,
          month,
          public_holidays: [...new Set(input.publicHolidays.filter((d) => d >= 1 && d <= days))].sort((a, b) => a - b),
          notes: input.notes.trim() || null,
          prepared_by: session.userId,
          prepared_at: new Date().toISOString(),
          approved_by: null,
          approved_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,kitchen,month" },
      )
      .select("id")
      .single();
    if (error) throw error;
    const rosterId = (saved as { id: string }).id;

    const { error: delErr } = await db.from("kitchen_roster_rows").delete().eq("roster_id", rosterId);
    if (delErr) throw delErr;
    const { error: insErr } = await db.from("kitchen_roster_rows").insert(
      rows.map((r, i) => ({
        roster_id: rosterId,
        employee_id: r.employeeId || null,
        display_name: r.displayName,
        sort_order: i,
        codes: Object.fromEntries(
          Object.entries(r.codes)
            .filter(([d, c]) => Number(d) >= 1 && Number(d) <= days && c && c.trim())
            .map(([d, c]) => [String(Number(d)), c.trim().toUpperCase().slice(0, 12)]),
        ),
      })),
    );
    if (insErr) throw insErr;
    revalidatePath("/kitchen/roster");
    return { id: rosterId };
  }, "Could not save the roster. Please try again.");
}

/** A Super Admin approves the roster (the "APPROVED BY" of the Excel roster). */
export async function approveRoster(rosterId: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    const supabase = await createClient();
    const { data: isSuper } = await supabase.rpc("current_user_is_super_admin");
    if (isSuper !== true) throw new Error("Only a Super Admin can approve the roster.");
    const { error } = await untyped(supabase)
      .from("kitchen_rosters")
      .update({ approved_by: session.userId, approved_at: new Date().toISOString() })
      .eq("id", rosterId);
    if (error) throw error;
    revalidatePath("/kitchen/roster");
    return {};
  }, "Could not approve the roster.");
}
