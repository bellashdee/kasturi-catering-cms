import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { shortNameOf } from "@/lib/hr/shortName";

type DB = SupabaseClient<Database>;

export type PersonOption = { name: string; position: string; department: string; userId: string | null; /** a Malaysian (local) staff member: only local staff hold the petty cash */ local: boolean; /** the name the person is called at work (SYAMIE) */ shortName: string };

/** The active staff with their position, department and whether they are local (what the signed-in person may read; A to Z). */
export async function loadPersonOptions(supabase: DB): Promise<PersonOption[]> {
  const { data } = await supabase.from("employees").select("full_name, short_name, position, department, nationality, user_id").eq("status", "active").order("full_name").limit(1000);
  const seen = new Set<string>();
  const list: PersonOption[] = [];
  for (const e of data ?? []) {
    const name = e.full_name?.trim();
    if (!name) continue;
    if (seen.has(name.toUpperCase())) {
      // the same person in another company: the login link is kept when only one of the records has it
      const first = list.find((p) => p.name.toUpperCase() === name.toUpperCase());
      if (first && !first.userId && e.user_id) first.userId = e.user_id;
      continue;
    }
    seen.add(name.toUpperCase());
    list.push({ name, position: e.position?.trim() ?? "", department: e.department?.trim() ?? "", userId: e.user_id ?? null, local: /^malay/i.test(e.nationality?.trim() ?? ""), shortName: shortNameOf(name, e.short_name) });
  }
  return list;
}

/** The positions to choose from: the ones staff hold, A to Z. */
export function positionOptions(people: PersonOption[]): string[] {
  return Array.from(new Set(people.map((p) => p.position).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/** The names (as in the staff records) of the people who hold a petty cash, upper case. */
export async function loadHolderNames(supabase: DB): Promise<Set<string>> {
  const { data } = await supabase.from("operation_petty_cash_holders").select("full_name");
  return new Set((data ?? []).map((h) => h.full_name.trim().toUpperCase()));
}

/** The people who hold a petty cash: the ones on the list of holders (a holder does not need a login). */
export const holdersOnly = (people: PersonOption[], holderNames: Set<string>) => people.filter((p) => holderNames.has(p.name.toUpperCase()));

/** The petty cash holder that belongs to the signed-in person (their own staff record), when they are one of the holders. */
export const ownHolder = (holders: PersonOption[], userId: string) => holders.find((p) => p.userId === userId);

/** A name as a pattern for a case-insensitive "equals" (ilike), so a name with % or _ in it is not read as a pattern. */
export const likeExact = (name: string) => name.trim().replace(/[\\%_]/g, "\\$&");

/** Whose petty cash is shown: the name and position chosen above the page (the signed-in person's own when nothing is chosen). */
export function chosenHolder(sp: { holder?: string; position?: string }, holders: PersonOption[], userId: string): { name: string; position: string } {
  if (sp.holder !== undefined) return { name: sp.holder.trim(), position: (sp.position ?? "").trim() };
  const own = ownHolder(holders, userId);
  return { name: own?.name ?? "", position: own?.position ?? "" };
}

/** The short name of a person written on a petty cash record (KHAIRUL ADLAN BIN SAGIMAN gives ADLAN): the one on their staff record, otherwise worked out from the name. */
export function shortNameIn(people: PersonOption[]) {
  const byName = new Map(people.map((p) => [p.name.toUpperCase(), p.shortName]));
  return (name: string | null | undefined) => {
    const full = name?.trim();
    if (!full) return "";
    return byName.get(full.toUpperCase()) ?? shortNameOf(full);
  };
}
