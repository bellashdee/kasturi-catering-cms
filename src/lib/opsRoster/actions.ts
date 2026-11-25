"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { sendPushToUsers } from "@/lib/push/send";
import { dayTitle, entryKey, STATUS, TASK_TYPES, type RosterEntry, type TaskType } from "@/lib/opsRoster/shared";
import { loadRosters, loadRosterStaff } from "@/lib/opsRoster/queries";

async function admin() {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  const supabase = await createClient();
  const { data: can } = await untyped(supabase).rpc("user_can_edit_ops_roster");
  if (can !== true) throw new Error("Only Redza or a Super Admin can change the duty roster.");
  return { session, supabase, db: untyped(supabase) };
}

function refresh() {
  revalidatePath("/driver-logistics/duty-roster");
  revalidatePath("/profile/duty-roster");
}

const TIME = /^\d{2}:\d{2}$/;
const TYPES = new Set(TASK_TYPES.map((t) => t.value));

/** Cleans one line as typed: valid statuses, times, task types; a line not on duty keeps no hours or tasks. */
function clean(e: RosterEntry): RosterEntry {
  const status = (["on_duty", "off", "leave", "mc"] as const).includes(e.status) ? e.status : "on_duty";
  const onDuty = status === "on_duty";
  const override = e.otHoursOverride === null || e.otHoursOverride === undefined || String(e.otHoursOverride) === "" ? null : Number(e.otHoursOverride);
  if (override !== null && (!Number.isFinite(override) || override < 0 || override > 24)) throw new Error("OT hours must be between 0 and 24.");
  const slots = onDuty
    ? e.slots
        .filter((s) => s.start || s.end)
        .map((s) => {
          if (!TIME.test(s.start) || !TIME.test(s.end)) throw new Error("Every working time needs a start and an end time.");
          const brk = Math.max(0, Math.min(600, Math.round(Number(s.break_minutes) || 0)));
          return { start: s.start, end: s.end, break_minutes: brk, ot: !!s.ot };
        })
    : [];
  const tasks = onDuty
    ? e.tasks
        .map((t) => ({ type: (TYPES.has(t.type) ? t.type : "other") as TaskType, text: t.text.trim().slice(0, 200), location: t.location.trim().slice(0, 120), time: TIME.test(t.time) ? t.time : "" }))
        .filter((t) => t.text || t.location || t.type !== "other")
    : [];
  return { staffId: e.staffId, status, ot: onDuty && !!e.ot, otHoursOverride: onDuty ? override : null, note: e.note.trim().slice(0, 300), slots, tasks };
}

export type SaveDayInput = { date: string; remarks: string; entries: RosterEntry[]; baseVersion: number | null };

/**
 * Saves the roster of one day. Other days are never touched. The lines that changed get a new "changed" time (they are highlighted
 * and their staff are told); every save is added to the change history with who, when and what changed. If someone else saved the
 * same day in the meantime, nothing is saved and the admin is asked to reload.
 */
export async function saveDayRoster(input: SaveDayInput): Promise<ActionResult<{ version: number; changed: number }>> {
  return runAction(async () => {
    const { session, db, supabase } = await admin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Choose a date.");
    const staff = await loadRosterStaff(supabase);
    const staffName = new Map(staff.map((s) => [s.id, s.shortName]));
    const entries = input.entries.filter((e) => staffName.has(e.staffId)).map(clean);
    if (new Set(entries.map((e) => e.staffId)).size !== entries.length) throw new Error("A staff member is on the roster twice.");
    const remarks = input.remarks.trim().slice(0, 1000);

    const existing = (await loadRosters(supabase, input.date, input.date)).get(input.date) ?? null;
    if (existing && input.baseVersion !== null && existing.version !== input.baseVersion) {
      throw new Error(`Someone changed this roster (${existing.updatedByName ?? "another admin"}) while you were editing. Reload the page to see the latest roster, then make your change again.`);
    }
    if (existing && input.baseVersion === null) throw new Error("A roster for this day was already created. Reload the page to see it.");

    // what changed, line by line
    const before = new Map((existing?.entries ?? []).map((e) => [e.staffId, e]));
    const changedIds: string[] = [];
    const notes: string[] = [];
    for (const e of entries) {
      const old = before.get(e.staffId);
      if (!old) {
        changedIds.push(e.staffId);
        if (existing) notes.push(`${staffName.get(e.staffId)} added`);
      } else if (entryKey(old) !== entryKey(e)) {
        changedIds.push(e.staffId);
        notes.push(old.status !== e.status ? `${staffName.get(e.staffId)}: ${STATUS[old.status].label} → ${STATUS[e.status].label}` : `${staffName.get(e.staffId)} changed`);
      }
    }
    for (const id of before.keys()) if (!entries.some((e) => e.staffId === id)) notes.push(`${staffName.get(id) ?? "A staff member"} removed`);
    const remarksChanged = (existing?.remarks ?? "") !== remarks;
    if (existing && !changedIds.length && !notes.length && !remarksChanged) throw new Error("Nothing was changed.");
    if (remarksChanged && existing) notes.push("Remarks changed");
    const summary = existing ? notes.join("; ") : `Roster created (${entries.length} staff)`;

    const now = new Date().toISOString();
    const version = (existing?.version ?? 0) + 1;
    const { data: saved, error } = await db
      .from("ops_rosters")
      .upsert(
        { roster_date: input.date, remarks: remarks || null, version, updated_by: session.userId, updated_at: now, ...(existing ? {} : { created_by: session.userId }) },
        { onConflict: "roster_date" },
      )
      .select("id")
      .single();
    if (error) throw error;
    const rosterId = (saved as { id: string }).id;

    const { error: delErr } = await db.from("ops_roster_entries").delete().eq("roster_id", rosterId);
    if (delErr) throw delErr;
    if (entries.length) {
      const { error: insErr } = await db.from("ops_roster_entries").insert(
        entries.map((e, i) => ({
          roster_id: rosterId,
          staff_id: e.staffId,
          status: e.status,
          ot: e.ot,
          ot_hours_override: e.otHoursOverride,
          note: e.note || null,
          slots: e.slots,
          tasks: e.tasks,
          sort_order: i,
          changed_at: changedIds.includes(e.staffId) ? now : before.get(e.staffId)?.changedAt ?? now,
        })),
      );
      if (insErr) throw insErr;
    }
    const { error: logErr } = await db.from("ops_roster_changes").insert({
      roster_id: rosterId,
      roster_date: input.date,
      version,
      changed_by: session.userId,
      changed_at: now,
      summary,
      snapshot: { remarks, entries },
    });
    if (logErr) throw logErr;

    // tell the staff whose line changed (only for today and later days)
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    if (changedIds.length && input.date >= today) {
      const { data: logins } = await db.rpc("ops_roster_staff_logins", { target_staff_ids: changedIds });
      const userIds = ((logins ?? []) as { user_id: string | null }[]).map((l) => l.user_id).filter((u): u is string => !!u && u !== session.userId);
      await sendPushToUsers(userIds, {
        title: existing ? "Your duty roster was updated" : "Your duty roster is ready",
        body: `${dayTitle(input.date)} — open to see your hours and tasks.`,
        url: `/profile/duty-roster?date=${input.date}`,
        tag: `ops-roster-${input.date}`,
      }).catch(() => undefined);
    }
    refresh();
    return { version, changed: changedIds.length };
  }, "Could not save the roster. Please try again.");
}

/** Deletes the roster of one day (the change history keeps the record). */
export async function deleteDayRoster(date: string): Promise<ActionResult> {
  return runAction(async () => {
    const { session, db, supabase } = await admin();
    const existing = (await loadRosters(supabase, date, date)).get(date);
    if (!existing?.id) throw new Error("There is no roster for this day.");
    const { error: logErr } = await db.from("ops_roster_changes").insert({
      roster_id: existing.id,
      roster_date: date,
      version: existing.version + 1,
      changed_by: session.userId,
      summary: "Roster deleted",
      snapshot: { remarks: existing.remarks, entries: existing.entries },
    });
    if (logErr) throw logErr;
    const { error } = await db.from("ops_rosters").delete().eq("id", existing.id);
    if (error) throw error;
    refresh();
    return {};
  }, "Could not delete the roster.");
}

/** Adds a staff member from HR to the roster staff list (or brings back one who was removed). */
export async function addRosterStaff(employeeId: string, shortName: string): Promise<ActionResult> {
  return runAction(async () => {
    const { db, supabase } = await admin();
    const name = shortName.trim().toUpperCase().slice(0, 30);
    if (!name) throw new Error("Enter the name to show on the roster (for example FADIL).");
    const staff = await loadRosterStaff(supabase);
    const { data: emp } = await supabase.from("employees").select("id, full_name").eq("id", employeeId).maybeSingle();
    if (!emp) throw new Error("Staff member not found in HR.");
    const same = staff.find((s) => s.employeeId === employeeId || s.fullName.toUpperCase() === emp.full_name.toUpperCase());
    if (same?.active) throw new Error(`${emp.full_name} is already on the roster as ${same.shortName}.`);
    if (same) {
      const { error } = await db.from("ops_roster_staff").update({ active: true, short_name: name }).eq("id", same.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("ops_roster_staff").insert({ employee_id: employeeId, short_name: name, sort_order: staff.length });
      if (error) throw error;
    }
    refresh();
    return {};
  }, "Could not add the staff member.");
}

/** Renames, moves, removes (inactive) or brings back a roster staff member. Past rosters keep their lines. */
export async function updateRosterStaff(id: string, change: { shortName?: string; active?: boolean; move?: -1 | 1 }): Promise<ActionResult> {
  return runAction(async () => {
    const { db, supabase } = await admin();
    if (change.move) {
      const staff = await loadRosterStaff(supabase);
      const i = staff.findIndex((s) => s.id === id);
      const j = i + change.move;
      if (i < 0 || j < 0 || j >= staff.length) return {};
      const order = [...staff];
      [order[i], order[j]] = [order[j], order[i]];
      for (let k = 0; k < order.length; k++) {
        if (order[k].sortOrder !== k) {
          const { error } = await db.from("ops_roster_staff").update({ sort_order: k }).eq("id", order[k].id);
          if (error) throw error;
        }
      }
    } else {
      const patch: Record<string, unknown> = {};
      if (change.shortName !== undefined) {
        const name = change.shortName.trim().toUpperCase().slice(0, 30);
        if (!name) throw new Error("The name cannot be empty.");
        patch.short_name = name;
      }
      if (change.active !== undefined) patch.active = change.active;
      const { error } = await db.from("ops_roster_staff").update(patch).eq("id", id);
      if (error) throw error;
    }
    refresh();
    return {};
  }, "Could not update the staff member.");
}
