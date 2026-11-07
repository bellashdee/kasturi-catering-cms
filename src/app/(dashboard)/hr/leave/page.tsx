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

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, month } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const access = await getHrAccess(supabase, session, targetCompanyIds);
  // a leave editor (Ms. Syaza, Ms. Nabilah) keys in and looks after the leave of the other staff too, without being an admin
  const { data: editorFlag } = await supabase.rpc("user_is_leave_editor");
  const isEditor = editorFlag === true;
  const canKeyIn = access.adminAnywhere || isEditor;
  // an admin or a leave editor sees the leave of every employee; anyone else only their own
  // the month is the month the leave starts in
  const requests = filterByMonth(
    (await listLeaveForCompanies(supabase, targetCompanyIds)).filter((r) => access.isAdminOf(r.company_id) || isEditor || access.ownEmployeeIds.has(r.employee_id)),
    month,
    (r) => r.start_date,
  );
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Leave Requests</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {requests.length} leave request{requests.length === 1 ? "" : "s"} · {canKeyIn ? "all employees you can access" : "your own"}
            {monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}
          </p>
        </div>
        {canKeyIn && (
          <Link href={`/hr/leave/new${requestedId ? `?company=${requestedId}` : ""}`} className="flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">
            + Key in leave for staff
          </Link>
        )}
      </div>

      <MonthFilter />

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
                  canDecide={admin}
                  canChange={admin || isEditor || r.status === "pending"}
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
