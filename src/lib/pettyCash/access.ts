import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { PersonOption } from "@/lib/pettyCash/people";
import { createAdminClient } from "@/lib/supabase/admin";

type DB = SupabaseClient<Database>;

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** Whether the person holds a petty cash, and whether they may see everyone's (only Ms. Penny and Ms. Nabilah may). */
export async function pettyCashAccess(supabase: DB, userId: string): Promise<{ isHolder: boolean; seeAll: boolean }> {
  const { data } = await supabase.from("operation_petty_cash_access").select("can_see_all").eq("user_id", userId).maybeSingle();
  return { isHolder: !!data, seeAll: data?.can_see_all === true };
}

/**
 * The people a staff claim is claimed from: whoever sees everyone's petty cash (Ms. Penny and Ms. Nabilah). The staff paid with their
 * own money first, then claim it back from one of them. Read with the service role because each person can only read their own access row.
 */
export async function claimPayers(): Promise<{ name: string; position: string }[]> {
  const admin = createAdminClient();
  const { data: access } = await admin.from("operation_petty_cash_access").select("user_id").eq("can_see_all", true);
  const ids = (access ?? []).map((a) => a.user_id);
  if (ids.length === 0) return [];
  const [{ data: emp }, { data: prof }] = await Promise.all([
    admin.from("employees").select("full_name, position, user_id").in("user_id", ids).eq("status", "active"),
    admin.from("profiles").select("id, full_name").in("id", ids),
  ]);
  const seen = new Set<string>();
  const list: { name: string; position: string }[] = [];
  for (const id of ids) {
    const e = (emp ?? []).find((x) => x.user_id === id);
    const name = (e?.full_name ?? (prof ?? []).find((p) => p.id === id)?.full_name ?? "").trim();
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));
    list.push({ name, position: e?.position?.trim() ?? "" });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** The name a person's own petty cash is kept under: their staff record, otherwise their login name. */
export function ownIdentity(people: PersonOption[], userId: string, loginName: string): { name: string; position: string } {
  const own = people.find((p) => p.userId === userId);
  return { name: own?.name ?? loginName.trim(), position: own?.position ?? "" };
}

/** Every name the signed-in person's own petty cash may be written under (staff record and login name). */
export async function ownNames(supabase: DB, userId: string): Promise<string[]> {
  const [{ data: emp }, { data: prof }] = await Promise.all([
    supabase.from("employees").select("full_name").eq("user_id", userId),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  return [...(emp ?? []).map((e) => e.full_name), prof?.full_name].filter((n): n is string => !!n?.trim()).map(norm);
}

/**
 * Whoever may not see everyone's petty cash can only record, change or delete their own: the name must be theirs. Ms. Penny and
 * Ms. Nabilah (see all) may work on anyone's.
 */
export async function assertOwnPerson(supabase: DB, userId: string, personName: string | null | undefined) {
  const { seeAll } = await pettyCashAccess(supabase, userId);
  if (seeAll) return;
  const mine = await ownNames(supabase, userId);
  if (!personName || !mine.includes(norm(personName))) throw new Error("You can only record and change your own petty cash.");
}
