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
import { ExportButtons } from "@/components/shared/ExportButtons";
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

  const companyLabel = requestedId ? (companies.find((c) => c.id === requestedId)?.name ?? "") : "All companies";
  const subtitle = `${companyLabel} - ${employees.length} employee${employees.length === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}`;
  const address = (e: (typeof records)[number]) =>
    [e.address_line, [e.address_postcode, e.address_city].filter(Boolean).join(" "), e.address_state].filter(Boolean).join(", ");
  // the Excel file carries every detail of the list; the printed page only the main ones so that it stays readable
  const exportTable = {
    title: "Employee Database",
    subtitle,
    landscape: true,
    columns: ["Employee No.", "Name", "Company", "I/C or Passport No.", "Date of Birth", "Gender", "Nationality", "Race", "Religion", "Marital Status", "Mobile No.", "Email", "Branch", "Department", "Position", "Employment Type", "Date Joined", "Status", "Address"],
    rows: employees.map((group) => {
      const f = group[0];
      return [
        joined(group.map((g) => g.employee_no)),
        f.full_name,
        joined(group.map((g) => g.companies?.name)),
        f.ic_passport_no ?? "",
        f.date_of_birth ?? "",
        f.gender ?? "",
        f.nationality ?? "",
        f.race ?? "",
        f.religion ?? "",
        f.marital_status ?? "",
        f.phone ?? "",
        f.email ?? "",
        joined(group.map((g) => g.branch)),
        joined(group.map((g) => g.department)),
        joined(group.map((g) => g.position)),
        joined(group.map((g) => EMPLOYMENT_TYPE_LABEL[g.employment_type] ?? g.employment_type)),
        joined(group.map((g) => g.join_date)),
        Array.from(new Set(group.map((g) => EMPLOYEE_STATUS_LABEL[g.status] ?? g.status))).join(" / "),
        address(f),
      ].map((v) => (v === "—" ? "" : v));
    }),
  };
  const printTable = {
    title: exportTable.title,
    subtitle,
    landscape: true,
    columns: ["No.", "Name", "Company", "I/C or Passport No.", "Position", "Mobile No.", "Date Joined", "Status"],
    rows: exportTable.rows.map((r, i) => [String(i + 1), r[1], r[2], r[3], r[14], r[10], r[16], r[17]]),
  };

  const linkClass = "flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Employee Database</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {employees.length} employee{employees.length === 1 ? "" : "s"}
            {records.length !== employees.length ? ` (${records.length} company records)` : ""}
          </p>
        </div>
        {access.adminAnywhere && (
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons table={exportTable} printTable={printTable} />
            <Link href={`/hr/import${query}`} className={linkClass}>
              Import Excel / CSV
            </Link>
            <Link href={`/hr/new${query}`} className="flex h-9 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">
              + Add Employee
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/birthdays${query}`} className={linkClass}>
          🎂 Birthday Calendar
        </Link>
        {showPayroll && (
          <Link href={`/payroll-centre${query}`} className={linkClass}>
            Payroll Centre
          </Link>
        )}
        <Link href={`/hr/leave${query}`} className={linkClass}>
          Leave Requests
        </Link>
        <Link href={`/hr/overtime${query}`} className={linkClass}>
          Overtime &amp; OT Form
        </Link>
        {access.adminAnywhere && (
          <Link href={`/hr/documents${query}`} className={linkClass}>
            Licences &amp; Documents
          </Link>
        )}
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
              <div>I/C / Passport</div>
              <div>Position</div>
              <div>Mobile No.</div>
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
                  <div className="break-words text-text-secondary">{first.ic_passport_no || "—"}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.position))}</div>
                  <div className="break-words text-text-secondary">{first.phone || "—"}</div>
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
