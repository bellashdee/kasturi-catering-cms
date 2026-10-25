import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { PersonOption } from "@/lib/pettyCash/people";

type DB = SupabaseClient<Database>;

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** Whether the person holds a petty cash, and whether they may see everyone's (only Ms. Penny and Ms. Nabilah may). */
export async function pettyCashAccess(supabase: DB, userId: string): Promise<{ isHolder: boolean; seeAll: boolean }> {
  const { data } = await supabase.from("operation_petty_cash_access").select("can_see_all").eq("user_id", userId).maybeSingle();
  return { isHolder: !!data, seeAll: data?.can_see_all === true };
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
