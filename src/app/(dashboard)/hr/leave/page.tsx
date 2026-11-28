import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listLeaveForCompanies } from "@/lib/hr/queries";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { getHrAccess } from "@/lib/hr/access";
import { LeaveItem } from "@/components/hr/LeaveItem";
import Link from "next/link";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { todayInMalaysia } from "@/lib/format";
import { leaveBalanceForYear, type LeaveAdjustment } from "@/lib/hr/leaveBalance";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL } from "@/lib/hr/constants";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";
import { approverName, displayNames, myTeamRequests, superiorsOf } from "@/lib/hr/superiors";

const SORTS = { submitted: "Submitted", start: "Start date", staff: "Staff name", status: "Status" };

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; year?: string; q?: string; type?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // everything is asked at the same time (not one after another), so the page opens faster
  // a leave editor (Ms. Syaza, Ms. Nabilah) keys in and looks after the leave of the other staff too, without being an admin
  const [access, { data: editorFlag }, { data: viewerFlag }, { data: approverFlag }, { data: superFlag }, team, companyLeave] = await Promise.all([
    getHrAccess(supabase, session, targetCompanyIds),
    supabase.rpc("user_is_leave_editor"),
    supabase.rpc("user_can_view_staff_leave"),
    supabase.rpc("user_can_approve_leave"),
    supabase.rpc("current_user_is_super_admin"),
    myTeamRequests(supabase),
    listLeaveForCompanies(supabase, targetCompanyIds),
  ]);
  const isEditor = editorFlag === true;
  const isViewer = viewerFlag === true;
  const isLeaveApprover = approverFlag === true;
  const isSuper = superFlag === true;
  const canKeyIn = access.adminAnywhere || isEditor;
  // only the people who may look at staff leave see it (the database enforces the same); anyone else only their own
  // the month is the month the leave starts in
  const visible = companyLeave.filter((r) => access.isAdminOf(r.company_id) || isEditor || isViewer || access.ownEmployeeIds.has(r.employee_id));
  // a superior also sees every leave of their own staff (to approve it), even of a company they are not an admin of
  const seen = new Set(visible.map((r) => r.id));
  const teamRows = team.leave
    .filter((l) => !seen.has(l.id))
    .map((l) => ({
      id: l.id,
      company_id: "",
      employee_id: l.employee_id,
      leave_type: l.leave_type,
      leave_type_other: l.leave_type_other,
      start_date: l.start_date,
      end_date: l.end_date,
      days: l.days,
      reason: l.reason,
      status: l.status,
      document_id: l.document_id,
      created_at: l.created_at,
      reviewed_by: null as string | null,
      decision_remarks: l.remarks,
      reviewer_name: l.reviewed_by_name,
      employees: { full_name: l.name },
      companies: { name: l.company },
    }));
  type LeaveView = (typeof teamRows)[number];
  const allRequests: LeaveView[] = [
    ...visible.map((r) => {
      const extra = r as unknown as { reviewed_by?: string | null; decision_remarks?: string | null };
      return {
        id: r.id,
        company_id: r.company_id,
        employee_id: r.employee_id,
        leave_type: r.leave_type,
        leave_type_other: r.leave_type_other,
        start_date: r.start_date,
        end_date: r.end_date,
        days: Number(r.days),
        reason: r.reason,
        status: r.status,
        document_id: r.document_id,
        created_at: r.created_at,
        reviewed_by: extra.reviewed_by ?? null,
        decision_remarks: extra.decision_remarks ?? null,
        reviewer_name: null as string | null,
        employees: { full_name: r.employees?.full_name ?? "" },
        companies: { name: r.companies?.name ?? "" },
      };
    }),
    ...teamRows,
  ];
  // the AL / MC balance of every staff for one year: for the people who look after the staff leave
  const thisYear = Number(todayInMalaysia().slice(0, 4));
  const balanceYear = Number(sp.year) >= 2020 && Number(sp.year) <= thisYear + 1 ? Number(sp.year) : thisYear;
  const showBalances = canKeyIn || isViewer;
  // who approves each leave (the staff member's superior) and who decided it; the staff for the balances at the same time
  const [superiors, reviewerNames, staffForBalance] = await Promise.all([
    superiorsOf(supabase, allRequests.map((r) => r.employee_id)),
    displayNames(supabase, allRequests.map((r) => r.reviewed_by)),
    showBalances
      ? supabase.from("employees").select("id, full_name, join_date, company_id, status, companies(name)").in("company_id", targetCompanyIds).eq("status", "active").order("full_name").then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);
  const canDecideRow = (r: LeaveView) => {
    if (access.ownEmployeeIds.has(r.employee_id)) return false;
    const sup = superiors.get(r.employee_id);
    return sup ? sup.userId === session.userId || isSuper : isLeaveApprover;
  };
  const approvalTextOf = (r: LeaveView) => {
    const who = approverName("leave", superiors.get(r.employee_id));
    const by = r.reviewer_name ?? (r.reviewed_by ? reviewerNames.get(r.reviewed_by) : null);
    if (r.status === "approved") return `Approved by ${by ?? who}`;
    if (r.status === "rejected") return `Rejected by ${by ?? who}`;
    return `Approval by: ${who}`;
  };
  const inMonth = filterByMonth(allRequests, month, (r) => r.start_date);
  const waitingForMe = allRequests.filter((r) => r.status === "pending" && superiors.get(r.employee_id)?.userId === session.userId).length;

  const { data: adjRows } = showBalances && staffForBalance.length
    ? await untyped(supabase).from("leave_balance_adjustments").select("employee_id, year, al_entitled, al_taken_before, mc_entitled, mc_taken_before").eq("year", balanceYear).in("employee_id", staffForBalance.map((e) => e.id))
    : { data: [] };
  const adjOf = (id: string) => ((adjRows ?? []) as (LeaveAdjustment & { employee_id: string })[]).filter((a) => a.employee_id === id);
  const balances = staffForBalance.map((e) => ({ e, b: leaveBalanceForYear(e.join_date, visible.filter((r) => r.employee_id === e.id), balanceYear, adjOf(e.id)) }));
  const q = sp.q?.trim().toLowerCase() ?? "";
  const { sort, dir } = readSort(sp, SORTS, "submitted", "desc");
  const requests = sortBy(
    inMonth.filter((r) => (!q || (r.employees?.full_name ?? "").toLowerCase().includes(q)) && (!sp.type || r.leave_type === sp.type) && (!sp.status || r.status === sp.status)),
    sort,
    dir,
    {
      submitted: (r) => r.created_at,
      start: [(r) => r.start_date, (r) => r.employees?.full_name],
      staff: [(r) => r.employees?.full_name, (r) => r.start_date],
      status: [(r) => LEAVE_STATUS_LABEL[r.status] ?? r.status, (r) => r.start_date],
    },
  );
  const query = requestedId ? `?company=${requestedId}` : "";
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Leave Requests</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {requests.length} leave request{requests.length === 1 ? "" : "s"} · {canKeyIn || isViewer ? "all employees you can access" : teamRows.length || team.leave.length ? "your own and your staff's" : "your own"}
            <span className="font-semibold text-text"> · {monthLabel ?? "All months"}</span>
          </p>
          {waitingForMe > 0 && (
            <p className="mt-1 text-[13px] font-semibold text-warning">{waitingForMe} leave request{waitingForMe === 1 ? "" : "s"} of your staff waiting for your approval.</p>
          )}
        </div>
        {canKeyIn && (
          <Link href={`/hr/leave/new${query}`} className="flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">
            + Key in leave for staff
          </Link>
        )}
      </div>

      {showBalances && balances.length > 0 && (
        <details className="rounded-xl border border-border bg-surface shadow-sm">
          <summary className="cursor-pointer px-5 py-3.5 text-[14px] font-bold text-text">
            Staff Leave Balance (AL &amp; MC) · {balanceYear}
            <span className="ml-2 text-[12.5px] font-normal text-text-secondary">{balances.length} staff · tap to open</span>
          </summary>
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-2.5 text-[12.5px]">
            <span className="text-text-secondary">Year:</span>
            {[thisYear - 2, thisYear - 1, thisYear].map((y) => (
              <Link key={y} href={`/hr/leave?year=${y}${requestedId ? `&company=${requestedId}` : ""}${month ? `&month=${month}` : ""}`} className={`rounded-full border px-3 py-1 font-semibold ${y === balanceYear ? "border-primary bg-primary text-white" : "border-border-strong text-text"}`}>
                {y}
              </Link>
            ))}
            <span className="ml-auto text-text-muted">Entitlement by the Employment Act 1955 unless HR set the company's own figure. Taken includes leave keyed in from before the system (open the staff → Leave Balance → Edit balance). Balance = entitled − taken − waiting approval.</span>
          </div>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-2">Staff</th>
                  <th className="px-2 py-2 text-right">Service</th>
                  <th className="px-2 py-2 text-right">AL entitled</th>
                  <th className="px-2 py-2 text-right">AL taken</th>
                  <th className="px-2 py-2 text-right">AL balance</th>
                  <th className="px-2 py-2 text-right">MC entitled</th>
                  <th className="px-2 py-2 text-right">MC taken</th>
                  <th className="px-5 py-2 text-right">MC balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {balances.map(({ e, b }) => (
                  <tr key={e.id}>
                    <td className="px-5 py-2">
                      <Link href={`/hr/${e.id}`} className="font-semibold text-text hover:underline">{e.full_name}</Link>
                      <div className="text-[11.5px] text-text-muted">{e.companies?.name}{e.join_date ? "" : " · no start date"}</div>
                    </td>
                    <td className="px-2 py-2 text-right text-text-secondary">{b.serviceYears} yr</td>
                    <td className="px-2 py-2 text-right tabular-nums">{b.al.entitled}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{b.al.taken + b.al.waiting}{b.adjusted ? "*" : ""}</td>
                    <td className={`px-2 py-2 text-right font-bold tabular-nums ${b.al.balance < 0 ? "text-danger" : "text-text"}`}>{b.al.balance}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{b.mc.entitled}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{b.mc.taken + b.mc.waiting}</td>
                    <td className={`px-5 py-2 text-right font-bold tabular-nums ${b.mc.balance < 0 ? "text-danger" : "text-text"}`}>{b.mc.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <MonthFilter allowAll />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/hr/leave${query}${month ? `${query ? "&" : "?"}month=${month}` : ""}`}>
        <FilterField label="Staff name">
          <input name="q" defaultValue={sp.q ?? ""} className={`${FILTER_INPUT} w-44`} />
        </FilterField>
        <FilterField label="Type">
          <Select name="type" defaultValue={sp.type ?? ""} className={`${FILTER_INPUT} w-56`}>
            <option value="">All types</option>
            {Object.entries(LEAVE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All statuses</option>
            {Object.entries(LEAVE_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {requests.length === 0 ? (
          <EmptyRow text={monthLabel ? "No leave requests in this month." : "No leave requests yet."} />
        ) : (
          <div className="divide-y divide-border">
            {requests.map((r) => {
              const admin = !!r.company_id && access.isAdminOf(r.company_id);
              return (
                <LeaveItem
                  key={r.id}
                  canDecide={canDecideRow(r)}
                  canChange={admin || isEditor || (access.ownEmployeeIds.has(r.employee_id) && r.status === "pending")}
                  leave={{
                    id: r.id,
                    employeeId: r.employee_id,
                    employeeName: r.employees?.full_name,
                    companyName: r.companies?.name,
                    leaveType: r.leave_type,
                    leaveTypeOther: r.leave_type_other,
                    startDate: r.start_date,
                    endDate: r.end_date,
                    days: Number(r.days),
                    reason: r.reason,
                    status: r.status,
                    documentId: r.document_id,
                    approvalText: approvalTextOf(r),
                    decisionRemarks: r.decision_remarks,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
