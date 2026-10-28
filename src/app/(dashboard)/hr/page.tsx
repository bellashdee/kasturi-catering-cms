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
import { getHrAccess } from "@/lib/hr/access";
import { canUsePayrollCentre } from "@/lib/hr/payrollAccess";

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

  const access = await getHrAccess(supabase, session, targetCompanyIds);
  // the Payroll Centre belongs to HR; only the Director of Finance and her personal assistant see its button
  const showPayroll = await canUsePayrollCentre(supabase);
  // an admin sees every employee of the company; anyone else only the staff record linked to their own login
  const records = (await listEmployees(supabase, targetCompanyIds, q)).filter((e) => access.canSee(e));

  // The same person who works for several companies has one record per company (leave, payroll and OT stay separate per company).
  // The list shows each person once, with a link to the record of every company.
  type Employee = (typeof records)[number];
  const byName = new Map<string, Employee[]>();
  for (const e of records) {
    const key = e.full_name.toUpperCase().replace(/\s+/g, " ").trim();
    byName.set(key, [...(byName.get(key) ?? []), e]);
  }
  const employees = Array.from(byName.values());
  const joined = (values: (string | null | undefined)[]) => Array.from(new Set(values.filter((v): v is string => !!v))).join(" / ") || "—";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Employee Database</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {employees.length} employee{employees.length === 1 ? "" : "s"}
            {records.length !== employees.length ? ` (${records.length} company records)` : ""}
          </p>
        </div>
        <div className="flex gap-2.5">
          <Link
            href={`/birthdays${query}`}
            className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
          >
            🎂 Birthday Calendar
          </Link>
          {showPayroll && (
            <Link
              href={`/payroll-centre${query}`}
              className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
            >
              Payroll Centre
            </Link>
          )}
          <Link
            href={`/hr/leave${query}`}
            className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
          >
            Leave Requests
          </Link>
          <Link
            href={`/hr/overtime${query}`}
            className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
          >
            Overtime &amp; OT Form
          </Link>
          {access.adminAnywhere && (
            <>
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
            </>
          )}
        </div>
      </div>

      {!access.adminAnywhere && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[13px] text-text-secondary shadow-sm">
          You can see your own HR record only. The details of other staff are visible to Madam Penny and Nabilah only.
        </div>
      )}

      {access.adminAnywhere && <SearchBox placeholder="Search employees by name..." />}

      {companies.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-text-secondary">Company</span>
          {[{ id: "", name: "All companies" }, ...companies].map((c) => {
            const active = (requestedId ?? "") === c.id;
            const params = new URLSearchParams();
            if (c.id) params.set("company", c.id);
            if (q) params.set("q", q);
            const qs = params.toString();
            return (
              <Link
                key={c.id || "all"}
                href={`/hr${qs ? `?${qs}` : ""}`}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${active ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}
              >
                {c.name}
              </Link>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {employees.length === 0 ? (
          <EmptyRow text={access.adminAnywhere ? "No employees yet. Add one manually or import an Excel/CSV list." : "No staff record is linked to your login yet. Ask an admin to link it."} />
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
            {employees.map((group) => {
              const first = group[0];
              const statuses = Array.from(new Set(group.map((g) => g.status)));
              return (
                <div
                  key={first.id}
                  className="grid grid-cols-[2fr_1.2fr_1.2fr_1fr_1fr_1fr] items-start border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div>
                    <Link href={`/hr/${first.id}${query}`} className="font-semibold text-text hover:underline">
                      {first.full_name}
                    </Link>
                    {companies.length > 1 && (
                      <span className="ml-2 inline-flex flex-wrap gap-x-2 text-[11px] font-normal text-text-muted">
                        {group.map((g) => (
                          <Link key={g.id} href={`/hr/${g.id}${query}`} className="hover:text-primary hover:underline">
                            {g.companies?.name}
                          </Link>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.department))}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.position))}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => EMPLOYMENT_TYPE_LABEL[g.employment_type] ?? g.employment_type))}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.join_date))}</div>
                  <div className="flex flex-wrap gap-1">
                    {statuses.map((st) => (
                      <StatusBadge key={st} tone={statusTone(st)}>
                        {EMPLOYEE_STATUS_LABEL[st] ?? st}
                      </StatusBadge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
