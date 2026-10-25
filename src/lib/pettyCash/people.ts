import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export type PersonOption = { name: string; position: string; department: string; /** a Malaysian (local) staff member: only local staff hold the petty cash */ local: boolean };

/** The active staff with their position, department and whether they are local (what the signed-in person may read; A to Z). */
export async function loadPersonOptions(supabase: DB): Promise<PersonOption[]> {
  const { data } = await supabase.from("employees").select("full_name, position, department, nationality").eq("status", "active").order("full_name").limit(1000);
  const seen = new Set<string>();
  const list: PersonOption[] = [];
  for (const e of data ?? []) {
    const name = e.full_name?.trim();
    if (!name || seen.has(name.toUpperCase())) continue;
    seen.add(name.toUpperCase());
    list.push({ name, position: e.position?.trim() ?? "", department: e.department?.trim() ?? "", local: /^malay/i.test(e.nationality?.trim() ?? "") });
  }
  return list;
}

/** The positions to choose from: the ones staff hold, A to Z. */
export function positionOptions(people: PersonOption[]): string[] {
  return Array.from(new Set(people.map((p) => p.position).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/** The people who may hold the petty cash: local staff only. */
export const holdersOnly = (people: PersonOption[]) => people.filter((p) => p.local);
