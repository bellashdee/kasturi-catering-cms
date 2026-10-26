import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listLeaveForCompanies } from "@/lib/hr/queries";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { getHrAccess } from "@/lib/hr/access";
import { LeaveItem } from "@/components/hr/LeaveItem";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const access = await getHrAccess(supabase, session, targetCompanyIds);
  // an admin sees the leave of every employee; anyone else only their own
  const requests = (await listLeaveForCompanies(supabase, targetCompanyIds)).filter((r) => access.isAdminOf(r.company_id) || access.ownEmployeeIds.has(r.employee_id));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Leave Requests</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{access.adminAnywhere ? "Across all employees you can access." : "Your own leave requests."}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {requests.length === 0 ? (
          <EmptyRow text="No leave requests yet." />
        ) : (
          <div className="divide-y divide-border">
            {requests.map((r) => {
              const admin = access.isAdminOf(r.company_id);
              return (
                <LeaveItem
                  key={r.id}
                  canDecide={admin}
                  canChange={admin || r.status === "pending"}
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
