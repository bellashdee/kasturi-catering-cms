import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listEmployees } from "@/lib/hr/queries";
import { EMPLOYMENT_TYPE_LABEL, EMPLOYEE_STATUS_LABEL } from "@/lib/hr/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SearchBox } from "@/components/SearchBox";

function statusTone(status: string): "success" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "terminated") return "danger";
  return "neutral";
}

export default async function HRPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, q } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const employees = await listEmployees(supabase, targetCompanyIds, q);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Employee Database</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {employees.length} employee{employees.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2.5">
          <Link
            href={`/hr/documents${query}`}
            className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
          >
            Licences &amp; Documents
          </Link>
          <Link
            href={`/hr/import${query}`}
            className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
          >
            Import Excel / CSV
          </Link>
          <Link
            href={`/hr/new${query}`}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            + Add Employee
          </Link>
        </div>
      </div>

      <SearchBox placeholder="Search employees by name..." />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {employees.length === 0 ? (
          <EmptyRow text="No employees yet. Add one manually or import an Excel/CSV list." />
        ) : (
          <div>
            <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Name</div>
              <div>Department</div>
              <div>Position</div>
              <div>Type</div>
              <div>Join Date</div>
              <div>Status</div>
            </div>
            {employees.map((e) => (
              <Link
                key={e.id}
                href={`/hr/${e.id}${query}`}
                className="grid grid-cols-[2fr_1.2fr_1.2fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">
                  {e.full_name}
                  {companies.length > 1 && (
                    <span className="ml-2 text-[11px] font-normal text-text-muted">
                      {e.companies?.name}
                    </span>
                  )}
                </div>
                <div className="text-text-secondary">{e.department || "—"}</div>
                <div className="text-text-secondary">{e.position || "—"}</div>
                <div className="text-text-secondary">{EMPLOYMENT_TYPE_LABEL[e.employment_type] ?? e.employment_type}</div>
                <div className="text-text-secondary">{e.join_date || "—"}</div>
                <div>
                  <StatusBadge tone={statusTone(e.status)}>
                    {EMPLOYEE_STATUS_LABEL[e.status] ?? e.status}
                  </StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
