import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export type PersonOption = { name: string; position: string; department: string };

/** The staff a petty cash can be given to, with their position and department (what the signed-in person may read; A to Z). */
export async function loadPersonOptions(supabase: DB): Promise<PersonOption[]> {
  const { data } = await supabase.from("employees").select("full_name, position, department").eq("status", "active").order("full_name").limit(1000);
  const seen = new Set<string>();
  const list: PersonOption[] = [];
  for (const e of data ?? []) {
    const name = e.full_name?.trim();
    if (!name || seen.has(name.toUpperCase())) continue;
    seen.add(name.toUpperCase());
    list.push({ name, position: e.position?.trim() ?? "", department: e.department?.trim() ?? "" });
  }
  return list;
}

/** The positions to choose from: the ones staff hold, A to Z. */
export function positionOptions(people: PersonOption[]): string[] {
  return Array.from(new Set(people.map((p) => p.position).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
