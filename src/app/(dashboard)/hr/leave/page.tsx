import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listLeaveForCompanies } from "@/lib/hr/queries";
import { leaveTypeText, LEAVE_STATUS_LABEL } from "@/lib/hr/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { LeaveRowActions } from "@/components/hr/LeaveRowActions";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { getHrAccess } from "@/lib/hr/access";

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
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">
                    <Link href={`/hr/${r.employee_id}`} className="hover:text-primary">{r.employees?.full_name}</Link>
                    <span className="ml-2 text-text-secondary font-normal">{leaveTypeText(r.leave_type, r.leave_type_other)}</span>
                    {r.document_id && <DocumentViewLink documentId={r.document_id} label="📎 MC / file" className="ml-2 text-xs" />}
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {r.start_date} → {r.end_date} · {r.days} day(s) · {r.companies?.name}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>
                    {LEAVE_STATUS_LABEL[r.status] ?? r.status}
                  </StatusBadge>
                  {r.status === "pending" && <LeaveRowActions leaveId={r.id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
