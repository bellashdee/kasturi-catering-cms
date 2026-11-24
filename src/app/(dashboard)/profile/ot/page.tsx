import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getOwnEmployee } from "@/lib/hr/ownRecord";
import { listOvertimeForEmployee } from "@/lib/hr/queries";
import { formatMalaysiaDate } from "@/lib/format";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { OT_STATUS_LABEL, OT_STATUS_TONE } from "@/lib/hr/overtime";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { ProfileHeader } from "@/components/hr/ProfileHeader";
import { OvertimeForm } from "@/components/hr/OvertimeForm";
import { OvertimeFormGuide } from "@/components/shared/FormGuides";

const n = (v: number) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(2).replace(/\.?0+$/, ""));

/** My Profile → OT Form: submit the day's overtime and follow the OT already sent. Staff of RM4,000 and above are sent to Claim Hours. */
export default async function MyOvertimePage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { record } = await searchParams;
  const supabase = await createClient();
  const { records, employee } = await getOwnEmployee(supabase, session.userId, record);
  const header = (
    <ProfileHeader active="/profile/ot" record={record} title="OT Form" intro="Fill in the day you worked overtime with the start and end time; the OT hours are worked out for you. Your manager approves it." records={records} currentId={employee?.id} />
  );
  if (!employee) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="Your staff record is not linked to your login yet. Please ask the HR admin to link it." />
      </div>
    );
  }

  const [{ data: claimHoursStaff }, overtime] = await Promise.all([untyped(supabase).rpc("employee_uses_claim_hours", { target_employee_id: employee.id }), listOvertimeForEmployee(supabase, employee.id)]);
  const rec = record ? `?record=${record}` : "";

  return (
    <div className="flex flex-col gap-5">
      {header}
      {claimHoursStaff === true ? (
        <div className="rounded-xl border border-primary/30 bg-surface p-5 text-[14px] leading-relaxed text-text-secondary shadow-sm">
          <div className="text-[16px] font-bold text-text">You claim hours instead of OT</div>
          Staff with a salary of RM4,000 and above cannot claim OT. Claim the extra hours you worked — every 8 approved hours gives you 1 day of replacement leave.
          <div className="mt-3">
            <Link href={`/profile/claim-hours${rec}`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-[14px] font-semibold text-white">Go to Claim Hours</Link>
          </div>
        </div>
      ) : (
        <SectionCard title="Submit overtime" action={<OvertimeFormGuide />}>
          <OvertimeForm
            staff={[{ id: employee.id, name: employee.full_name, companyId: employee.company_id, companyName: employee.companies?.name ?? "", department: employee.department, position: employee.position }]}
            defaultEmployeeId={employee.id}
            maxDate={todayInMalaysia()}
            doneHref={`/profile/ot${rec}`}
          />
        </SectionCard>
      )}
      <SectionCard title="My overtime">
        {overtime.length === 0 ? (
          <EmptyRow text="No overtime submitted yet." />
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-[14px]">
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3 text-right">OT hours</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overtime.map((o) => (
                  <tr key={o.id}>
                    <td className="px-5 py-3 font-semibold text-text">{formatMalaysiaDate(o.work_date)}</td>
                    <td className="px-3 py-3 text-text-secondary">{o.ot_start_time ? `${o.ot_start_time.slice(0, 5)} – ${(o.ot_end_time ?? "").slice(0, 5)}` : "—"}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums">{n(Number(o.approved_hours ?? o.hours ?? 0))}</td>
                    <td className="px-3 py-3 text-text-secondary">{o.reason || "—"}</td>
                    <td className="px-5 py-3"><StatusBadge tone={OT_STATUS_TONE[o.status] ?? "neutral"}>{OT_STATUS_LABEL[o.status] ?? o.status}</StatusBadge></td>
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
