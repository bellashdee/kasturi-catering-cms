import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { hrAdminCompanyIds } from "@/lib/hr/permissions";
import { listEmployeesForExport } from "@/lib/hr/queries";
import { EMPLOYMENT_TYPE_LABEL, employeeStatusLabel } from "@/lib/hr/constants";

/** A cell starting with = + - @ would run as a formula when opened in Excel, so it is prefixed with an apostrophe. */
function csvCell(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * Employee directory export. Authorised before any data is read: only companies where the user is an HR Admin
 * are included. Contains directory fields only — never IC/passport, address, emergency contact, bank, KWSP or salary.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionContext();
  if (!session) return new NextResponse("Please sign in.", { status: 401 });

  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name");
  const all = companies ?? [];
  const params = request.nextUrl.searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, all, params.get("company") ?? undefined);
  const allowedIds = await hrAdminCompanyIds(supabase, targetCompanyIds);
  if (allowedIds.length === 0) return new NextResponse("You are not allowed to export employee records.", { status: 403 });

  const rows = await listEmployeesForExport(supabase, allowedIds, {
    q: params.get("q") ?? undefined,
    departmentId: params.get("department") ?? undefined,
    status: params.get("status") ?? undefined,
    type: params.get("type") ?? undefined,
  });

  const { data: departments } = await supabase.from("departments").select("id, name").in("company_id", allowedIds);
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));

  const header = ["Employee ID", "Name", "Company", "Department", "Job Title", "Employment Type", "Status", "Start Date"];
  const lines = [header.map(csvCell).join(",")];
  for (const e of rows) {
    lines.push(
      [
        e.employee_no,
        e.full_name,
        e.companies?.name,
        (e.department_id && deptName.get(e.department_id)) || e.department,
        e.position,
        EMPLOYMENT_TYPE_LABEL[e.employment_type] ?? e.employment_type,
        employeeStatusLabel(e.status, e.employment_stage),
        e.join_date,
      ]
        .map((c) => csvCell(c as string | null))
        .join(","),
    );
  }

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="employees-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
