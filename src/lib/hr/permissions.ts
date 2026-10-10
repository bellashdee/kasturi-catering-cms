import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

/**
 * How the signed-in user relates to one employee record. Every flag comes from the database
 * (the same functions the Row Level Security policies use), so the screen can never show more
 * than the database would actually return. Hiding things here is for tidiness only.
 */
export type EmployeeViewer = {
  isHr: boolean;
  isFinance: boolean;
  isDirector: boolean;
  isManager: boolean;
  isSelf: boolean;
};

export async function getEmployeeViewer(
  supabase: DB,
  employee: { id: string; company_id: string },
): Promise<EmployeeViewer> {
  const [hr, finance, director, manager, self] = await Promise.all([
    supabase.rpc("user_is_hr_admin", { target_company_id: employee.company_id }),
    supabase.rpc("user_is_finance", { target_company_id: employee.company_id }),
    supabase.rpc("user_is_director", { target_company_id: employee.company_id }),
    supabase.rpc("user_manages_employee", { target_employee_id: employee.id }),
    supabase.rpc("user_owns_employee", { target_employee_id: employee.id }),
  ]);
  return {
    isHr: hr.data === true,
    isFinance: finance.data === true,
    isDirector: director.data === true,
    isManager: manager.data === true,
    isSelf: self.data === true,
  };
}

/** Which profile sections this viewer may open. Anything not listed stays hidden. */
export function visibleSections(v: EmployeeViewer): string[] {
  const sections = ["overview"];
  if (v.isHr || v.isSelf) sections.push("contact");
  if (v.isHr || v.isSelf) sections.push("documents");
  if (v.isHr || v.isDirector || v.isManager || v.isSelf) sections.push("history");
  if (v.isHr || v.isManager || v.isSelf) sections.push("leave", "attendance");
  if (v.isHr || v.isFinance || v.isSelf) sections.push("claims");
  if (v.isHr || v.isFinance) sections.push("payroll");
  return sections;
}

export const SECTION_LABEL: Record<string, string> = {
  overview: "Personal & Employment",
  contact: "Contact & Emergency",
  documents: "Documents",
  history: "Employment History",
  leave: "Leave Summary",
  attendance: "Attendance Summary",
  claims: "Claims Summary",
  payroll: "Payroll Summary",
};

/** Whether the signed-in user is an HR Admin for at least one of these companies (drives menu buttons only). */
export async function isHrAdminForAny(supabase: DB, companyIds: string[]): Promise<boolean> {
  const results = await Promise.all(companyIds.map((id) => supabase.rpc("user_is_hr_admin", { target_company_id: id })));
  return results.some((r) => r.data === true);
}

/** Company ids (from the given list) where the signed-in user is an HR Admin. */
export async function hrAdminCompanyIds(supabase: DB, companyIds: string[]): Promise<string[]> {
  const results = await Promise.all(companyIds.map((id) => supabase.rpc("user_is_hr_admin", { target_company_id: id })));
  return companyIds.filter((_, i) => results[i].data === true);
}
