import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getHrAccess } from "@/lib/hr/access";
import { listProbationDashboard } from "@/lib/hr/probationQueries";
import { CONFIRMATION_LETTER_LABEL, PROBATION_STATUS_LABEL, daysBetween, formatShortDate, reminderMark, type ProbationStatus } from "@/lib/hr/probation";
import { todayInMalaysia } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";

const TONE: Record<ProbationStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  on_probation: "info",
  review_required: "warning",
  probation_extended: "warning",
  pending_confirmation: "danger",
  confirmed: "success",
};
const ORDER: ProbationStatus[] = ["review_required", "pending_confirmation", "probation_extended", "on_probation", "confirmed"];
const SORTS = { status: "Status", name: "Staff name", start: "Start Date", end: "End Date" };

export default async function ProbationDashboardPage({ searchParams }: { searchParams: Promise<{ company?: string; q?: string; status?: string; month?: string; sort?: string; dir?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const sp = await searchParams;
  const { company: requestedId, q, status: statusFilter, month } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;
  const access = await getHrAccess(supabase, session, targetCompanyIds);
  if (!access.adminAnywhere) redirect("/hr");

  const today = todayInMalaysia();
  const all = await listProbationDashboard(supabase, targetCompanyIds, today);
  const search = (q ?? "").trim().toLowerCase();
  // the month is the month the current probation ends in
  const searched = filterByMonth(search ? all.filter((r) => r.name.toLowerCase().includes(search)) : all, month, (r) => r.probation.current_end_date);
  const monthLabel = monthLabelOf(month);
  const counts = Object.fromEntries(ORDER.map((s) => [s, searched.filter((r) => r.status === s).length])) as Record<ProbationStatus, number>;
  const filter = ORDER.includes(statusFilter as ProbationStatus) ? (statusFilter as ProbationStatus) : null;
  // by default the statuses that need action come first, then the probation that ends soonest
  const { sort, dir } = readSort(sp, SORTS, "status", "asc");
  const rows = sortBy(filter ? searched.filter((r) => r.status === filter) : searched, sort, dir, {
    status: [(r) => ORDER.indexOf(r.status), (r) => r.probation.current_end_date, (r) => r.name],
    name: (r) => r.name,
    start: [(r) => r.probation.start_date, (r) => r.name],
    end: [(r) => r.probation.current_end_date, (r) => r.name],
  });
  const query = requestedId ? `?company=${requestedId}` : "";

  const link = (s: ProbationStatus | null) => {
    const params = new URLSearchParams();
    if (requestedId) params.set("company", requestedId);
    if (q) params.set("q", q);
    if (month) params.set("month", month);
    if (s) params.set("status", s);
    if (sp.sort) params.set("sort", sp.sort);
    if (sp.dir) params.set("dir", sp.dir);
    const qs = params.toString();
    return `/hr/probation${qs ? `?${qs}` : ""}`;
  };

  const dayText = (end: string | null, status: ProbationStatus) => {
    if (!end || status === "confirmed") return "";
    const left = daysBetween(today, end);
    return left < 0 ? `ended ${-left} day${left === -1 ? "" : "s"} ago` : left === 0 ? "ends today" : `${left} day${left === 1 ? "" : "s"} left`;
  };

  const exportTable = {
    title: "Probation Tracker",
    subtitle: `${rows.length} staff${filter ? ` - ${PROBATION_STATUS_LABEL[filter]}` : ""}${monthLabel ? ` - probation ending ${monthLabel}` : ""} (as at ${formatShortDate(today)})`,
    landscape: true,
    columns: ["Employee Name", "Company", "Position", "Employment Start Date", "Probation Period", "Original Probation End", "Current Probation End", "Probation Status", "Confirmation Letter"],
    rows: rows.map((r) => [
      r.name,
      r.company,
      r.position ?? "",
      r.probation.start_date ? formatShortDate(r.probation.start_date) : "",
      r.probation.probation_months ? `${r.probation.probation_months} month${r.probation.probation_months === 1 ? "" : "s"}` : "",
      r.probation.original_end_date ? formatShortDate(r.probation.original_end_date) : "",
      r.probation.current_end_date ? formatShortDate(r.probation.current_end_date) : "",
      PROBATION_STATUS_LABEL[r.status],
      CONFIRMATION_LETTER_LABEL[r.probation.confirmation_letter_status] ?? "",
    ]),
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/hr${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Employee Database</Link>
          <h1 className="mt-2 text-[22px] font-extrabold text-text">Probation Tracker</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Each staff member follows the probation period written in their own offer letter. HR is reminded 30, 14 and 7 days before a probation ends.
            {monthLabel ? <span className="font-semibold text-text"> Showing probation ending in {monthLabel}.</span> : null}
          </p>
        </div>
        <ExportButtons table={exportTable} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={link(null)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${!filter ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text-secondary hover:bg-surface-alt"}`}>
          All ({searched.length})
        </Link>
        {ORDER.map((s) => (
          <Link key={s} href={link(s)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${filter === s ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text-secondary hover:bg-surface-alt"}`}>
            {PROBATION_STATUS_LABEL[s]} ({counts[s]})
          </Link>
        ))}
      </div>

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month, status: filter }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={link(filter)}>
        <FilterField label="Staff name">
          <input name="q" defaultValue={q ?? ""} className={`${FILTER_INPUT} w-48`} />
        </FilterField>
      </ListFilters>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {rows.length === 0 ? (
          <EmptyRow text={monthLabel ? "No probation ends in this month." : "No staff in this list."} />
        ) : (
          <table className="w-full min-w-[1000px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Employee Name</th>
                <th className="px-3 py-3">Position</th>
                <th className="px-3 py-3">Start Date</th>
                <th className="px-3 py-3">Probation</th>
                <th className="px-3 py-3">Original End</th>
                <th className="px-3 py-3">Current End</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Confirmation Letter</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.probation;
                const mark = r.status === "confirmed" ? null : reminderMark(p.current_end_date, today);
                return (
                  <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-surface-alt">
                    <td className="px-4 py-3">
                      <Link href={`/hr/${r.employeeId}${query}#probation`} className="font-semibold text-text hover:underline">{r.name}</Link>
                      <div className="text-[11.5px] text-text-muted">{r.company}</div>
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{r.position ?? "—"}</td>
                    <td className="px-3 py-3 text-text-secondary">{p.start_date ? formatShortDate(p.start_date) : "—"}</td>
                    <td className="px-3 py-3 text-text-secondary">{p.probation_months ? `${p.probation_months} month${p.probation_months === 1 ? "" : "s"}` : "—"}</td>
                    <td className="px-3 py-3 text-text-secondary">{p.original_end_date ? formatShortDate(p.original_end_date) : "—"}</td>
                    <td className="px-3 py-3">
                      <div className={r.extended ? "font-semibold text-text" : "text-text-secondary"}>{p.current_end_date ? formatShortDate(p.current_end_date) : "—"}</div>
                      <div className={`text-[11.5px] ${mark === 7 ? "font-semibold text-danger" : mark ? "text-warning" : "text-text-muted"}`}>{dayText(p.current_end_date, r.status)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={TONE[r.status]}>{PROBATION_STATUS_LABEL[r.status]}</StatusBadge>
                      {p.needs_verification && <div className="mt-0.5 text-[11.5px] text-warning">Details to verify</div>}
                      {r.waiting && <div className="mt-0.5 text-[11.5px] text-warning">Letter waiting for management</div>}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{CONFIRMATION_LETTER_LABEL[p.confirmation_letter_status] ?? p.confirmation_letter_status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
