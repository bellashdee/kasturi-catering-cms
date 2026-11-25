import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getOwnEmployee } from "@/lib/hr/ownRecord";
import { listLeaveForEmployee } from "@/lib/hr/queries";
import { formatMalaysiaDate } from "@/lib/format";
import { LEAVE_STATUS_LABEL, leaveTypeText } from "@/lib/hr/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { ProfileHeader } from "@/components/hr/ProfileHeader";
import { LeaveBalanceCard } from "@/components/hr/LeaveBalanceCard";
import { LeaveRequestForm } from "@/components/hr/LeaveRequestForm";
import { approverName, displayNames, superiorsOf } from "@/lib/hr/superiors";
import { LeaveFormGuide } from "@/components/shared/FormGuides";

const TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };
const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** My Profile → Leave Form: the leave balance, the form to apply for leave, and the leave applied for so far. */
export default async function MyLeavePage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { record } = await searchParams;
  const supabase = await createClient();
  const { records, employee } = await getOwnEmployee(supabase, session.userId, record);
  const header = (
    <ProfileHeader active="/profile/leave" record={record} title="Leave Form" intro="Check how many days you have left, then apply. Your superior is told and approves it; you can follow it in the list below." records={records} currentId={employee?.id} />
  );
  if (!employee) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="Your staff record is not linked to your login yet. Please ask the HR admin to link it." />
      </div>
    );
  }
  const [leave, superiors] = await Promise.all([listLeaveForEmployee(supabase, employee.id), superiorsOf(supabase, [employee.id])]);
  const leaveApprover = approverName("leave", superiors.get(employee.id));
  const reviewers = await displayNames(supabase, leave.map((l) => (l as unknown as { reviewed_by?: string | null }).reviewed_by));
  const decidedBy = (l: (typeof leave)[number]) => {
    const extra = l as unknown as { reviewed_by?: string | null; decision_remarks?: string | null };
    if (l.status === "pending") return `Waiting for ${leaveApprover}`;
    const who = (extra.reviewed_by && reviewers.get(extra.reviewed_by)) || leaveApprover;
    const verb = l.status === "approved" ? "Approved by" : l.status === "rejected" ? "Rejected by" : "";
    return `${verb ? `${verb} ${who}` : ""}${extra.decision_remarks ? ` · "${extra.decision_remarks}"` : ""}` || "—";
  };

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard title="Apply for leave" action={<LeaveFormGuide />}>
          <LeaveRequestForm employeeId={employee.id} companyId={employee.company_id} doneHref={`/profile/leave${record ? `?record=${record}` : ""}`} approverName={leaveApprover} />
        </SectionCard>
        <LeaveBalanceCard employeeId={employee.id} joinDate={employee.join_date} leave={leave} supabase={supabase} claimHoursHref="/profile/claim-hours" />
      </div>
      <SectionCard title="My leave">
        {leave.length === 0 ? (
          <EmptyRow text="No leave applied yet." />
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-3">Type</th>
                  <th className="px-3 py-3">From</th>
                  <th className="px-3 py-3">To</th>
                  <th className="px-3 py-3 text-right">Days</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-5 py-3">Approval</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leave.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-3 font-semibold text-text">{leaveTypeText(l.leave_type, l.leave_type_other)}</td>
                    <td className="px-3 py-3">{formatMalaysiaDate(l.start_date)}</td>
                    <td className="px-3 py-3">{formatMalaysiaDate(l.end_date)}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums">{n(Number(l.days ?? 0))}</td>
                    <td className="px-3 py-3 text-text-secondary">{l.reason || "—"}</td>
                    <td className="px-3 py-3"><StatusBadge tone={TONE[l.status] ?? "neutral"}>{LEAVE_STATUS_LABEL[l.status] ?? l.status}</StatusBadge></td>
                    <td className="px-5 py-3 text-[13px] text-text-secondary">{decidedBy(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
