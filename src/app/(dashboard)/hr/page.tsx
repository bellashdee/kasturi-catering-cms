import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { hrAdminCompanyIds } from "@/lib/hr/permissions";
import { listDepartments, searchEmployees, STATUS_FILTERS, TYPE_FILTERS } from "@/lib/hr/queries";
import { EMPLOYMENT_TYPE_LABEL, EMPLOYEE_STATUS_LABEL, EMPLOYMENT_STAGE_LABEL, employeeStatusLabel, employeeStatusTone } from "@/lib/hr/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";

type SearchParams = { company?: string; q?: string; department?: string; status?: string; type?: string; page?: string };

const filterInput =
  "h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-text outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const secondaryButton = "flex items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text";

export default async function HRPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const query = sp.company ? `?company=${sp.company}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const pageNumber = Number.parseInt(sp.page ?? "1", 10);
  const [result, departments, hrCompanyIds] = await Promise.all([
    searchEmployees(supabase, targetCompanyIds, {
      q: sp.q,
      departmentId: sp.department,
      status: sp.status,
      type: sp.type,
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
    }),
    listDepartments(supabase, targetCompanyIds),
    hrAdminCompanyIds(supabase, targetCompanyIds),
  ]);
  const isHr = hrCompanyIds.length > 0;
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  // Keeps the current filters when moving between pages or exporting.
  const keep = new URLSearchParams();
  for (const key of ["company", "q", "department", "status", "type"] as const) {
    const value = sp[key];
    if (value) keep.set(key, value);
  }
  const pageHref = (p: number) => {
    const params = new URLSearchParams(keep);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/hr${qs ? `?${qs}` : ""}`;
  };
  const exportQs = keep.toString();
  const filtersActive = Boolean(sp.q || sp.department || sp.status || sp.type);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Employee Directory</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {result.total} employee{result.total === 1 ? "" : "s"}
            {filtersActive ? " match your filters" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`/hr/overtime${query}`} className={secondaryButton}>Overtime &amp; OT Form</Link>
          <Link href={`/hr/documents${query}`} className={secondaryButton}>Licences &amp; Documents</Link>
          {isHr && <Link href={`/hr/departments${query}`} className={secondaryButton}>Departments</Link>}
          {isHr && <a href={`/hr/export${exportQs ? `?${exportQs}` : ""}`} className={secondaryButton}>Export CSV</a>}
          {isHr && <Link href={`/hr/import${query}`} className={secondaryButton}>Import Excel / CSV</Link>}
          {isHr && (
            <Link href={`/hr/new${query}`} className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
              + Add Employee
            </Link>
          )}
        </div>
      </div>

      <form method="get" action="/hr" className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center" role="search">
        {sp.company && <input type="hidden" name="company" value={sp.company} />}
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Search name or employee ID..." className={`${filterInput} sm:w-72`} aria-label="Search employees" />
        <select name="department" defaultValue={sp.department ?? ""} className={filterInput} aria-label="Department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className={filterInput} aria-label="Employment status">
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{EMPLOYMENT_STAGE_LABEL[s] ?? EMPLOYEE_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className={filterInput} aria-label="Employment type">
          <option value="">All types</option>
          {TYPE_FILTERS.map((t) => (
            <option key={t} value={t}>{EMPLOYMENT_TYPE_LABEL[t]}</option>
          ))}
        </select>
        <button type="submit" className={`${secondaryButton} h-10 py-0`}>Apply</button>
        {filtersActive && (
          <Link href={`/hr${query}`} className="text-[13px] font-semibold text-text-secondary">Clear filters</Link>
        )}
      </form>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {result.rows.length === 0 ? (
          <EmptyRow text={filtersActive ? "No employees match these filters." : "No employees yet. Add one manually or import an Excel/CSV list."} />
        ) : (
          <div>
            <div className="hidden grid-cols-[0.8fr_2fr_1.2fr_1.2fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted md:grid">
              <div>ID</div>
              <div>Name</div>
              <div>Department</div>
              <div>Job Title</div>
              <div>Type</div>
              <div>Start Date</div>
              <div>Status</div>
            </div>
            {result.rows.map((e) => (
              <Link
                key={e.id}
                href={`/hr/${e.id}${query}`}
                className="grid grid-cols-2 gap-y-1 border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt md:grid-cols-[0.8fr_2fr_1.2fr_1.2fr_1fr_1fr_1fr]"
              >
                <div className="order-2 text-text-muted md:order-none">{e.employee_no || "—"}</div>
                <div className="order-1 col-span-2 font-semibold text-text md:order-none md:col-span-1">
                  {e.full_name}
                  {companies.length > 1 && <span className="ml-2 text-[11px] font-normal text-text-muted">{e.companies?.name}</span>}
                </div>
                <div className="order-3 text-text-secondary md:order-none">{(e.department_id && deptName.get(e.department_id)) || e.department || "—"}</div>
                <div className="order-4 text-text-secondary md:order-none">{e.position || "—"}</div>
                <div className="order-5 text-text-secondary md:order-none">{EMPLOYMENT_TYPE_LABEL[e.employment_type] ?? e.employment_type}</div>
                <div className="order-6 text-text-secondary md:order-none">{e.join_date || "—"}</div>
                <div className="order-7 md:order-none">
                  <StatusBadge tone={employeeStatusTone(e.status, e.employment_stage)}>{employeeStatusLabel(e.status, e.employment_stage)}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-[13px]" aria-label="Pagination">
          {result.page > 1 ? (
            <Link href={pageHref(result.page - 1)} className={secondaryButton}>← Previous</Link>
          ) : (
            <span />
          )}
          <span className="text-text-secondary">Page {result.page} of {totalPages}</span>
          {result.page < totalPages ? (
            <Link href={pageHref(result.page + 1)} className={secondaryButton}>Next →</Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
