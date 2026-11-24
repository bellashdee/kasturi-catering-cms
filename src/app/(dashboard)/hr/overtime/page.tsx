import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listOvertimeForMonth } from "@/lib/hr/otQueries";
import {
  OT_LEVEL_LABEL,
  OT_LEVEL_TONE,
  OT_MONTHLY_LIMIT,
  OT_STATUS_LABEL,
  OT_STATUS_TONE,
  countedOtHours,
  formatHours,
  otLevel,
} from "@/lib/hr/overtime";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatMalaysiaDate } from "@/lib/format";
import { malaysiaMonthNow } from "@/lib/driverAttendance/date";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Date", staff: "Staff name", hours: "Hours", status: "Status" };

type Summary = {
  employeeId: string;
  name: string;
  company: string;
  department: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

export default async function OvertimePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, year: yearParam, month: monthParam } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const now = malaysiaMonthNow();
  const year = Number(yearParam) || now.year;
  const month = Number(monthParam) || now.month;

  const q = sp.q?.trim().toLowerCase() ?? "";
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const monthRecords = (await listOvertimeForMonth(supabase, targetCompanyIds, year, month)).filter((r) => !q || (r.employees?.full_name ?? "").toLowerCase().includes(q));
  // the status filter narrows the list of OT records; the staff summary always counts the whole month
  const records = sortBy(
    monthRecords.filter((r) => !sp.status || r.status === sp.status),
    sort,
    dir,
    {
      date: [(r) => r.work_date, (r) => r.created_at],
      staff: [(r) => r.employees?.full_name, (r) => r.work_date],
      hours: [(r) => Number(r.hours), (r) => r.work_date],
      status: [(r) => OT_STATUS_LABEL[r.status] ?? r.status, (r) => r.work_date],
    },
  );

  // Per-staff summary for the month: counted hours come from Submitted + Approved records only.
  const byStaff = new Map<string, Summary>();
  for (const r of monthRecords) {
    const s =
      byStaff.get(r.employee_id) ??
      { employeeId: r.employee_id, name: r.employees?.full_name ?? "—", company: r.companies?.name ?? "—", department: r.employees?.department ?? "—", total: 0, pending: 0, approved: 0, rejected: 0 };
    s.total += countedOtHours(r);
    if (r.status === "pending_approval") s.pending += 1;
    if (r.status === "approved") s.approved += 1;
    if (r.status === "rejected") s.rejected += 1;
    byStaff.set(r.employee_id, s);
  }
  const summaries =
    sort === "staff"
      ? sortBy(Array.from(byStaff.values()), "name", dir, { name: (s: Summary) => s.name })
      : sortBy(Array.from(byStaff.values()), "total", sort === "hours" ? dir : "desc", { total: (s: Summary) => s.total });
  const pendingRequests = monthRecords.filter((r) => r.status === "pending_approval");
  const monthLabel = `${MONTH_LABEL[month - 1]} ${year}`;

  const { headers, tableRows } = buildReportRows(
    summaries,
    [
      { key: "staff", label: "Staff", exportValue: (s) => s.name, display: (s) => <Link href={`/hr/${s.employeeId}`} className="font-semibold text-text hover:text-primary">{s.name}</Link> },
      { key: "company", label: "Company", exportValue: (s) => s.company },
      { key: "department", label: "Department", exportValue: (s) => s.department },
      { key: "month", label: "Month", exportValue: () => monthLabel },
      { key: "total", label: "Total OT Hours", exportValue: (s) => Math.round(s.total * 100) / 100, display: (s) => formatHours(s.total) },
      { key: "remaining", label: `Remaining Before ${OT_MONTHLY_LIMIT}`, exportValue: (s) => Math.max(0, OT_MONTHLY_LIMIT - s.total), display: (s) => formatHours(Math.max(0, OT_MONTHLY_LIMIT - s.total)) },
      {
        key: "status",
        label: "Status",
        exportValue: (s) => OT_LEVEL_LABEL[otLevel(s.total)].replace(/^\S+\s/, ""),
        display: (s) => <StatusBadge tone={OT_LEVEL_TONE[otLevel(s.total)]}>{OT_LEVEL_LABEL[otLevel(s.total)]}</StatusBadge>,
      },
      { key: "pending", label: "Pending OT Requests", exportValue: (s) => s.pending },
      { key: "approved", label: "Approved OT", exportValue: (s) => s.approved },
      { key: "rejected", label: "Rejected OT", exportValue: (s) => s.rejected },
    ],
    (s) => s.employeeId,
  );

  const atLimit = summaries.filter((s) => otLevel(s.total) === "limit");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Overtime</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">OT dashboard for {monthLabel}. Limit: {OT_MONTHLY_LIMIT} hours per staff per month.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/hr/claim-hours${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Claim Hours (RM4,000+)</Link>
          <Link href={`/hr/overtime/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-white">+ Staff OT Form</Link>
        </div>
      </div>

      <ListFilters keep={{ company: requestedId }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/hr/overtime${query}`}>
        <FilterField label="Month">
          <Select name="month" defaultValue={month} className={`${FILTER_INPUT} w-36`}>
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Year">
          <input type="number" name="year" defaultValue={year} className={`${FILTER_INPUT} w-24`} />
        </FilterField>
        <FilterField label="Staff name">
          <input name="q" defaultValue={sp.q ?? ""} className={`${FILTER_INPUT} w-44`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All statuses</option>
            {Object.entries(OT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      {atLimit.length > 0 && (
        <div className="rounded-xl border-2 border-danger bg-danger-bg px-4 py-3">
          <div className="text-[15px] font-extrabold text-danger">🔴 OT LIMIT REACHED – {OT_MONTHLY_LIMIT} HOURS</div>
          <p className="mt-1 text-[13px] text-danger">
            {atLimit.map((s) => s.name).join(", ")} {atLimit.length === 1 ? "has" : "have"} reached {OT_MONTHLY_LIMIT} OT hours. Further OT requires OT Request and Manager Approval.
          </p>
        </div>
      )}

      {pendingRequests.length > 0 && (
        <SectionCard title={`Pending Manager Approval (${pendingRequests.length})`}>
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {pendingRequests.map((r) => (
              <Link key={r.id} href={`/hr/overtime/${r.id}`} className="flex items-center justify-between px-5 py-3 text-[13px] hover:bg-bg">
                <div>
                  <div className="font-semibold text-text">{r.employees?.full_name} <span className="font-normal text-text-secondary">· {formatHours(Number(r.hours))} on {formatMalaysiaDate(`${r.work_date}T12:00:00+08:00`)}</span></div>
                  <div className="text-xs text-text-muted">{r.reason || "No reason given"} · {r.companies?.name}</div>
                </div>
                <StatusBadge tone="warning">Review</StatusBadge>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Staff OT Summary">
        {summaries.length === 0 ? (
          <EmptyRow text={`No OT recorded for ${monthLabel}.`} />
        ) : (
          <div className="-mx-5 -mb-5">
            <ReportTable filenameBase={`staff-ot-${year}-${month}`} headers={headers} rows={tableRows} />
          </div>
        )}
      </SectionCard>

      <SectionCard title={`OT Records — ${monthLabel}`}>
        {records.length === 0 ? (
          <EmptyRow text="No OT records for this month." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {records.map((r) => (
              <Link key={r.id} href={`/hr/overtime/${r.id}`} className="flex items-center justify-between px-5 py-3 text-[13px] hover:bg-bg">
                <div>
                  <div className="font-semibold text-text">
                    {r.employees?.full_name}
                    <span className="ml-2 font-normal text-text-secondary">{formatHours(Number(r.hours))} · {formatMalaysiaDate(`${r.work_date}T12:00:00+08:00`)}{r.ot_start_time && r.ot_end_time ? ` · ${r.ot_start_time.slice(0, 5)}–${r.ot_end_time.slice(0, 5)}` : ""}</span>
                  </div>
                  <div className="text-xs text-text-muted">{r.reason || "No reason given"} · {r.companies?.name}</div>
                </div>
                <StatusBadge tone={OT_STATUS_TONE[r.status] ?? "neutral"}>{OT_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
