import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getOvertime, listOvertimeAuditLog, countedHoursForMonth } from "@/lib/hr/otQueries";
import {
  OT_DECIDABLE_STATUSES,
  OT_MONTHLY_LIMIT,
  OT_STATUS_LABEL,
  OT_STATUS_TONE,
  formatHours,
  otLevel,
  type OtStatus,
} from "@/lib/hr/overtime";
import { formatMalaysiaDate, formatMalaysiaDateTime } from "@/lib/format";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { OvertimeRecordActions } from "@/components/hr/OvertimeRecordActions";
import { OvertimeReviewPanel } from "@/components/hr/OvertimeReviewPanel";

const AUDIT_LABEL: Record<string, string> = {
  ot_created: "Created (draft)",
  ot_edited: "Edited",
  ot_submitted: "Submitted",
  ot_request_submitted: "OT Request submitted (above 104 hours)",
  ot_approved: "Approved",
  ot_rejected: "Rejected",
  ot_cancelled: "Cancelled",
};

function time(value: string | null): string {
  return value ? value.slice(0, 5) : "—";
}

function otDate(workDate: string): string {
  return formatMalaysiaDate(`${workDate}T12:00:00+08:00`);
}

export default async function OvertimeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let ot;
  try {
    ot = await getOvertime(supabase, id);
  } catch {
    notFound();
  }

  const [auditLog, monthlyTotal, { data: isManager }, { data: isAdmin }, reviewer] = await Promise.all([
    listOvertimeAuditLog(supabase, id),
    countedHoursForMonth(supabase, ot.employee_id, ot.work_date),
    supabase.rpc("user_is_ot_manager", { target_company_id: ot.company_id }),
    supabase.rpc("user_is_company_admin", { target_company_id: ot.company_id }),
    ot.reviewed_by ? supabase.from("profiles").select("full_name").eq("id", ot.reviewed_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const isOwnRecord = ot.employees?.user_id === session.userId;
  const canEditOwn = isOwnRecord || isAdmin === true;
  const canDecide = isManager === true && !isOwnRecord && OT_DECIDABLE_STATUSES.includes(ot.status as OtStatus);
  const level = otLevel(monthlyTotal);
  const decided = ot.status === "approved" || ot.status === "rejected";

  const details: [string, string][] = [
    ["Staff Name", ot.employees?.full_name ?? "—"],
    ["Company", ot.companies?.name ?? "—"],
    ["Department", ot.employees?.department ?? "—"],
    ["Position", ot.employees?.position ?? "—"],
    ["OT Date", otDate(ot.work_date)],
    ["Normal Working Hours", ot.normal_working_hours !== null ? `${ot.normal_working_hours} hrs` : "—"],
    ["OT Start Time", time(ot.ot_start_time)],
    ["OT End Time", time(ot.ot_end_time)],
    ["Total OT Hours", formatHours(Number(ot.hours))],
    ["Submission Date / Time", ot.submitted_at ? `${formatMalaysiaDateTime(ot.submitted_at)} (Malaysia time)` : "Not submitted yet"],
    ["Monthly OT total (counted)", `${formatHours(monthlyTotal)} of ${OT_MONTHLY_LIMIT} hrs`],
  ];

  const labelClass = "text-[11px] font-bold uppercase tracking-wide text-text-muted";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/hr/overtime" className="text-[12.5px] font-semibold text-text-secondary">← Back to Overtime</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-extrabold text-text">{ot.employees?.full_name} — OT {otDate(ot.work_date)}</h1>
            <p className="mt-0.5 text-[13px] text-text-secondary">{ot.companies?.name}</p>
          </div>
          <StatusBadge tone={OT_STATUS_TONE[ot.status] ?? "neutral"}>{OT_STATUS_LABEL[ot.status] ?? ot.status}</StatusBadge>
        </div>
      </div>

      {level === "limit" && (
        <div className="rounded-xl border-2 border-danger bg-danger-bg px-4 py-3">
          <div className="text-[15px] font-extrabold text-danger">🔴 OT LIMIT REACHED – {OT_MONTHLY_LIMIT} HOURS</div>
          <p className="mt-1 text-[13px] text-danger">
            This staff member has reached {OT_MONTHLY_LIMIT} OT hours ({formatHours(monthlyTotal)} this month). Further OT requires OT Request and Manager Approval.
          </p>
        </div>
      )}
      {ot.exceeds_limit && ot.status === "pending_approval" && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-2.5 text-[13px] font-semibold text-warning">
          Pending Manager Approval — this OT takes the month above {OT_MONTHLY_LIMIT} hours, so it is not confirmed until a manager approves it.
        </div>
      )}

      <SectionCard title="OT Details">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className={labelClass}>{label}</dt>
              <dd className="mt-0.5 font-semibold text-text">{value}</dd>
            </div>
          ))}
          <div className="col-span-2">
            <dt className={labelClass}>Reason / Description</dt>
            <dd className="mt-0.5 text-text">{ot.reason || "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className={labelClass}>Manager&apos;s approval</dt>
            <dd className="mt-0.5">{ot.document_id ? <DocumentViewLink documentId={ot.document_id} /> : <span className="text-text-muted">None</span>}</dd>
          </div>
        </dl>
      </SectionCard>

      {decided && (
        <SectionCard title="Manager Decision">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
            <div><dt className={labelClass}>Manager</dt><dd className="mt-0.5 font-semibold text-text">{reviewer.data?.full_name ?? "—"}</dd></div>
            <div><dt className={labelClass}>Decision date / time</dt><dd className="mt-0.5 font-semibold text-text">{formatMalaysiaDateTime(ot.reviewed_at)}</dd></div>
            <div><dt className={labelClass}>Decision</dt><dd className="mt-0.5 font-semibold text-text">{OT_STATUS_LABEL[ot.status]}</dd></div>
            <div><dt className={labelClass}>Approved OT hours</dt><dd className="mt-0.5 font-semibold text-text">{ot.approved_hours !== null ? formatHours(Number(ot.approved_hours)) : "—"}</dd></div>
            <div className="col-span-2"><dt className={labelClass}>Remarks</dt><dd className="mt-0.5 text-text">{ot.manager_remarks || "—"}</dd></div>
          </dl>
        </SectionCard>
      )}

      {canDecide && (
        <SectionCard title={ot.status === "pending_approval" ? "Manager Review — OT Request" : "Manager Review"}>
          <OvertimeReviewPanel overtimeId={id} requestedHours={Number(ot.hours)} />
        </SectionCard>
      )}
      {isManager === true && isOwnRecord && OT_DECIDABLE_STATUSES.includes(ot.status as OtStatus) && (
        <p className="text-[12.5px] text-text-muted">You cannot approve or reject your own OT. Another manager must review it.</p>
      )}

      {canEditOwn && ["draft", "submitted", "pending_approval"].includes(ot.status) && (
        <div className="flex justify-end">
          <OvertimeRecordActions overtimeId={id} status={ot.status} />
        </div>
      )}

      <SectionCard title="Audit Trail">
        {auditLog.length === 0 ? (
          <p className="text-[13px] text-text-muted">No history yet.</p>
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {auditLog.map((entry) => (
              <div key={entry.id} className="px-5 py-2.5 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text">{AUDIT_LABEL[entry.action] ?? entry.action}</span>
                  <span className="text-text-muted">{formatMalaysiaDateTime(entry.created_at)}</span>
                </div>
                <div className="text-text-secondary">
                  {entry.performerName ?? "System"}
                  {entry.new_value ? ` · ${entry.new_value}` : ""}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
