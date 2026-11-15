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
import { LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL } from "@/lib/hr/constants";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { submitted: "Submitted", start: "Start date", staff: "Staff name", status: "Status" };

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; q?: string; type?: string; status?: string; sort?: string; dir?: string }>;
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

  const access = await getHrAccess(supabase, session, targetCompanyIds);
  // a leave editor (Ms. Syaza, Ms. Nabilah) keys in and looks after the leave of the other staff too, without being an admin
  const [{ data: editorFlag }, { data: viewerFlag }, { data: approverFlag }] = await Promise.all([
    supabase.rpc("user_is_leave_editor"),
    supabase.rpc("user_can_view_staff_leave"),
    supabase.rpc("user_can_approve_leave"),
  ]);
  const isEditor = editorFlag === true;
  const isViewer = viewerFlag === true;
  const canApprove = approverFlag === true;
  const canKeyIn = access.adminAnywhere || isEditor;
  // only the people who may look at staff leave see it (the database enforces the same); anyone else only their own
  // the month is the month the leave starts in
  const inMonth = filterByMonth(
    (await listLeaveForCompanies(supabase, targetCompanyIds)).filter((r) => access.isAdminOf(r.company_id) || isEditor || isViewer || access.ownEmployeeIds.has(r.employee_id)),
    month,
    (r) => r.start_date,
  );
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
            {requests.length} leave request{requests.length === 1 ? "" : "s"} · {canKeyIn || isViewer ? "all employees you can access" : "your own"}
            {monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}
          </p>
        </div>
        {canKeyIn && (
          <Link href={`/hr/leave/new${query}`} className="flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">
            + Key in leave for staff
          </Link>
        )}
      </div>

      <MonthFilter />

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
              const admin = access.isAdminOf(r.company_id);
              return (
                <LeaveItem
                  key={r.id}
                  canDecide={canApprove}
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
