import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { probationStatus, type ProbationStatus } from "@/lib/hr/probation";

type DB = SupabaseClient<Database>;
export type ProbationRow = Database["public"]["Tables"]["employee_probation"]["Row"];
export type ProbationEvent = Database["public"]["Tables"]["employee_probation_events"]["Row"];

const APPROVED_EXTENSION = ["approved", "issued"];

export const hasApprovedExtension = (events: ProbationEvent[]) => events.some((e) => e.kind === "extension" && APPROVED_EXTENSION.includes(e.status));

/** The probation of one person (the staff records of every company they work in are looked at) and its whole history, oldest first. */
export async function getProbationForPerson(supabase: DB, employeeIds: string[], today: string) {
  const { data: probation } = await supabase.from("employee_probation").select("*").in("employee_id", employeeIds).limit(1).maybeSingle();
  if (!probation) return null;
  const { data: events } = await supabase.from("employee_probation_events").select("*").eq("probation_id", probation.id).order("created_at", { ascending: true });
  const list = events ?? [];
  return { probation, events: list, status: probationStatus(probation, hasApprovedExtension(list), today) };
}

export type DashboardRow = {
  probation: ProbationRow;
  employeeId: string;
  name: string;
  position: string | null;
  company: string;
  status: ProbationStatus;
  extended: boolean;
  /** an extension or confirmation letter that is waiting for management */
  waiting: boolean;
};

/** The probation dashboard: one row per staff member, with the status worked out from the dates. */
export async function listProbationDashboard(supabase: DB, companyIds: string[], today: string): Promise<DashboardRow[]> {
  const { data, error } = await supabase
    .from("employee_probation")
    .select("*, employees(full_name, position), companies(name)")
    .in("company_id", companyIds)
    .order("current_end_date", { ascending: true, nullsFirst: true });
  if (error) throw error;
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const { data: events } = ids.length
    ? await supabase.from("employee_probation_events").select("probation_id, kind, status").in("probation_id", ids).in("kind", ["extension", "confirmation"])
    : { data: [] as Pick<ProbationEvent, "probation_id" | "kind" | "status">[] };
  const byProbation = new Map<string, Pick<ProbationEvent, "probation_id" | "kind" | "status">[]>();
  for (const e of events ?? []) byProbation.set(e.probation_id, [...(byProbation.get(e.probation_id) ?? []), e]);

  return rows.map((r) => {
    const evs = byProbation.get(r.id) ?? [];
    const extended = evs.some((e) => e.kind === "extension" && APPROVED_EXTENSION.includes(e.status));
    return {
      probation: r,
      employeeId: r.employee_id,
      name: r.employees?.full_name ?? "",
      position: r.position_in_letter ?? r.employees?.position ?? null,
      company: r.companies?.name ?? "",
      status: probationStatus(r, extended, today),
      extended,
      waiting: evs.some((e) => e.status === "pending_approval"),
    };
  });
}
