import type { SupabaseClient } from "@supabase/supabase-js";
import { untyped } from "@/lib/kitchenPurchase/shared";

/**
 * Who approves a staff member's OT and leave: their own superior (employees.superior_user_id, from the list "LIST APPROVAL STAFF BY
 * WHO"). A Super Admin can step in when the superior is away. Staff without a superior keep the approvers used before.
 */
export type Superior = { userId: string; name: string };

/** Who decides when the staff member has no superior on their record. */
export const FALLBACK_APPROVER = { ot: "Saiful, Redza, Atiq or Ismaizal", leave: "Madam Penny" } as const;

/** The superior of each staff record (only those that have one). */
export async function superiorsOf(supabase: unknown, employeeIds: string[]): Promise<Map<string, Superior>> {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  const map = new Map<string, Superior>();
  if (ids.length === 0) return map;
  const { data } = await untyped(supabase).rpc("employee_superiors", { target_employee_ids: ids });
  for (const row of (data ?? []) as { employee_id: string; superior_user_id: string; superior_name: string | null }[]) {
    map.set(row.employee_id, { userId: row.superior_user_id, name: row.superior_name ?? "the superior" });
  }
  return map;
}

/** The names of the people who decided (approved / rejected), by login. */
export async function displayNames(supabase: unknown, userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await untyped(supabase).rpc("user_display_names", { target_user_ids: ids });
  for (const row of (data ?? []) as { user_id: string; display_name: string | null }[]) if (row.display_name) map.set(row.user_id, row.display_name);
  return map;
}

/** The name shown as "Approval by": the superior, or the approvers used before for staff without one. */
export function approverName(kind: "ot" | "leave", superior: Superior | undefined | null): string {
  return superior?.name ?? FALLBACK_APPROVER[kind];
}

/** The signed-in person is the superior of at least one staff member (they get the Team Approvals tab). */
export async function isSuperiorAnywhere(supabase: SupabaseClient | unknown): Promise<boolean> {
  const { data } = await untyped(supabase).rpc("user_is_superior_anywhere");
  return data === true;
}

export type TeamOvertime = {
  id: string;
  employee_id: string;
  name: string;
  company: string;
  work_date: string;
  start: string | null;
  end: string | null;
  hours: number;
  reason: string | null;
  status: string;
  exceeds_limit: boolean | null;
  document_id: string | null;
  submitted_at: string | null;
  approved_hours: number | null;
  remarks: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
};

export type TeamLeave = {
  id: string;
  employee_id: string;
  name: string;
  company: string;
  leave_type: string;
  leave_type_other: string | null;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  document_id: string | null;
  created_at: string;
  remarks: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
};

/** Every OT (except drafts) and every leave of the staff the signed-in person is the superior of. */
export async function myTeamRequests(supabase: unknown): Promise<{ overtime: TeamOvertime[]; leave: TeamLeave[] }> {
  const { data } = await untyped(supabase).rpc("my_team_requests");
  const d = (data ?? {}) as { overtime?: TeamOvertime[]; leave?: TeamLeave[] };
  return { overtime: d.overtime ?? [], leave: d.leave ?? [] };
}
