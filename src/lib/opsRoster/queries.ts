import { untyped } from "@/lib/kitchenPurchase/shared";
import type { DayRoster, RosterEntry, RosterStaff, RosterStatus, RosterTask, TimeSlot } from "@/lib/opsRoster/shared";

type EntryRow = {
  roster_id: string;
  staff_id: string;
  status: RosterStatus;
  ot: boolean;
  ot_hours_override: number | null;
  note: string | null;
  slots: TimeSlot[] | null;
  tasks: RosterTask[] | null;
  sort_order: number;
  changed_at: string | null;
};
type RosterRow = { id: string; roster_date: string; remarks: string | null; version: number; updated_at: string | null; updated_by: string | null };

export const toEntry = (r: EntryRow): RosterEntry => ({
  staffId: r.staff_id,
  status: r.status,
  ot: r.ot,
  otHoursOverride: r.ot_hours_override === null ? null : Number(r.ot_hours_override),
  note: r.note ?? "",
  slots: (r.slots ?? []).map((s) => ({ start: s.start ?? "", end: s.end ?? "", break_minutes: Number(s.break_minutes) || 0, ot: !!s.ot })),
  tasks: (r.tasks ?? []).map((t) => ({ type: t.type ?? "other", text: t.text ?? "", location: t.location ?? "", time: t.time ?? "" })),
  changedAt: r.changed_at,
});

/** The roster staff (in their order), with the full name from HR. */
export async function loadRosterStaff(supabase: unknown): Promise<RosterStaff[]> {
  const db = untyped(supabase);
  const { data } = await db.from("ops_roster_staff").select("id, employee_id, short_name, sort_order, active, employees(full_name, user_id)").order("sort_order").order("short_name");
  return ((data ?? []) as unknown as { id: string; employee_id: string; short_name: string; sort_order: number; active: boolean; employees: { full_name: string; user_id: string | null } | null }[]).map((s) => ({
    id: s.id,
    employeeId: s.employee_id,
    shortName: s.short_name,
    fullName: s.employees?.full_name ?? s.short_name,
    sortOrder: s.sort_order,
    active: s.active,
    userLinked: !!s.employees?.user_id,
  }));
}

async function namesOf(supabase: unknown, ids: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map();
  const { data } = await untyped(supabase).rpc("ops_roster_people", { target_user_ids: list });
  return new Map(((data ?? []) as { user_id: string; display_name: string | null }[]).map((r) => [r.user_id, r.display_name ?? "—"]));
}

/** The rosters of a range of days (both ends included), by date. */
export async function loadRosters(supabase: unknown, from: string, to: string): Promise<Map<string, DayRoster>> {
  const db = untyped(supabase);
  const { data: rosters } = await db.from("ops_rosters").select("id, roster_date, remarks, version, updated_at, updated_by").gte("roster_date", from).lte("roster_date", to).order("roster_date");
  const list = (rosters ?? []) as RosterRow[];
  const out = new Map<string, DayRoster>();
  if (!list.length) return out;
  const [{ data: entries }, names] = await Promise.all([
    db.from("ops_roster_entries").select("*").in("roster_id", list.map((r) => r.id)).order("sort_order"),
    namesOf(supabase, list.map((r) => r.updated_by)),
  ]);
  for (const r of list) {
    out.set(r.roster_date, {
      id: r.id,
      date: r.roster_date,
      remarks: r.remarks ?? "",
      version: r.version,
      updatedAt: r.updated_at,
      updatedByName: r.updated_by ? names.get(r.updated_by) ?? null : null,
      entries: ((entries ?? []) as EntryRow[]).filter((e) => e.roster_id === r.id).map(toEntry),
    });
  }
  return out;
}

/** The latest roster saved before the date (for "copy from"). */
export async function latestRosterBefore(supabase: unknown, date: string): Promise<DayRoster | null> {
  const { data } = await untyped(supabase).from("ops_rosters").select("roster_date").lt("roster_date", date).order("roster_date", { ascending: false }).limit(1);
  const d = (data ?? [])[0] as { roster_date: string } | undefined;
  if (!d) return null;
  return (await loadRosters(supabase, d.roster_date, d.roster_date)).get(d.roster_date) ?? null;
}

export type RosterChange = { id: string; version: number; changedAt: string; changedByName: string; summary: string };

/** The change history of a day (newest first). */
export async function loadRosterChanges(supabase: unknown, date: string): Promise<RosterChange[]> {
  const { data } = await untyped(supabase).from("ops_roster_changes").select("id, version, changed_at, changed_by, summary").eq("roster_date", date).order("changed_at", { ascending: false });
  const rows = (data ?? []) as { id: string; version: number; changed_at: string; changed_by: string | null; summary: string }[];
  const names = await namesOf(supabase, rows.map((r) => r.changed_by));
  return rows.map((r) => ({ id: r.id, version: r.version, changedAt: r.changed_at, changedByName: r.changed_by ? names.get(r.changed_by) ?? "—" : "—", summary: r.summary }));
}
