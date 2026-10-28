import { createAdminClient } from "@/lib/supabase/admin";

export type EditChange = { field: string; oldValue: string | null; newValue: string | null };

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** The details whose value is different after an edit (written the same way before and after, so a blank and nothing are the same). */
export function diffChanges(before: Record<string, unknown> | null, after: Record<string, unknown> | null, columns: readonly string[]): EditChange[] {
  const changes: EditChange[] = [];
  for (const c of columns) {
    const o = text(before?.[c]);
    const n = text(after?.[c]);
    if (o !== n) changes.push({ field: c, oldValue: o, newValue: n });
  }
  return changes;
}

/** Writes the edit history: who changed which detail, from what to what. A failure to write is reported to the server log and never undoes the edit. */
export async function recordEditHistory(input: { employeeId: string; companyId: string; editorId: string; changes: EditChange[] }) {
  if (input.changes.length === 0) return;
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", input.editorId).maybeSingle();
    const name = profile?.full_name?.trim() || "Unknown";
    const { error } = await admin.from("employee_edit_history").insert(
      input.changes.map((c) => ({ employee_id: input.employeeId, company_id: input.companyId, edited_by: input.editorId, edited_by_name: name, field: c.field, old_value: c.oldValue, new_value: c.newValue })),
    );
    if (error) throw error;
  } catch (err) {
    console.warn("Edit history could not be written:", err instanceof Error ? err.message : err);
  }
}
