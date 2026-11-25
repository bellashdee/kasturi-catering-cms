import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { isSuperiorAnywhere, myTeamRequests } from "@/lib/hr/superiors";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { formatMalaysiaDate } from "@/lib/format";
import { LEAVE_STATUS_LABEL, leaveTypeText } from "@/lib/hr/constants";
import { OT_STATUS_LABEL, OT_STATUS_TONE, formatHours } from "@/lib/hr/overtime";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { ProfileHeader } from "@/components/hr/ProfileHeader";
import { MonthFilter } from "@/components/MonthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { LeaveRowActions } from "@/components/hr/LeaveRowActions";
import { OvertimeReviewPanel } from "@/components/hr/OvertimeReviewPanel";

const LEAVE_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };
const otWaiting = (status: string) => status === "submitted" || status === "pending_approval";
const day = (d: string) => formatMalaysiaDate(`${d}T12:00:00+08:00`);

/**
 * My Profile → Team Approvals: for a superior, every leave and OT of their own staff (from the list of who approves whom). What waits for
 * them comes first, with Approve / Reject; the rest shows who decided. Filter by month (or all months), type, status and name.
 */
export default async function TeamApprovalsPage({ searchParams }: { searchParams: Promise<{ month?: string; kind?: string; status?: string; q?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  if (!(await isSuperiorAnywhere(supabase))) redirect("/profile");

  const sp = await searchParams;
  const month = sp.month && sp.month !== "all" ? sp.month : undefined;
  const kind = sp.kind === "leave" || sp.kind === "ot" ? sp.kind : "";
  const status = sp.status ?? "waiting";
  const q = sp.q?.trim().toLowerCase() ?? "";
  const team = await myTeamRequests(supabase);

  const leaveStatusOk = (s: string) => status === "all" || (status === "waiting" ? s === "pending" : s === status);
  const otStatusOk = (s: string) => status === "all" || (status === "waiting" ? otWaiting(s) : s === status);
  const byName = (name: string) => !q || name.toLowerCase().includes(q);

  const leave = kind === "ot" ? [] : filterByMonth(team.leave, month, (l) => l.start_date).filter((l) => leaveStatusOk(l.status) && byName(l.name));
  const overtime = kind === "leave" ? [] : filterByMonth(team.overtime, month, (o) => o.work_date).filter((o) => otStatusOk(o.status) && byName(o.name));
  // what waits for a decision first, then the newest
  leave.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.start_date.localeCompare(a.start_date));
  overtime.sort((a, b) => Number(otWaiting(b.status)) - Number(otWaiting(a.status)) || b.work_date.localeCompare(a.work_date));

  const waitingLeave = team.leave.filter((l) => l.status === "pending").length;
  const waitingOt = team.overtime.filter((o) => otWaiting(o.status)).length;
  const staffCount = new Set([...team.leave, ...team.overtime].map((r) => r.employee_id)).size;
  const periodLabel = monthLabelOf(month) ?? "All months";

  return (
    <div className="flex flex-col gap-5">
      <ProfileHeader
        active="/profile/team"
        title="Team Approvals"
        intro="The leave and OT of the staff who report to you. Approve or reject what is waiting for you; the staff member sees your decision in their own Leave Form or OT Form."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`rounded-xl border px-4 py-3 shadow-sm ${waitingLeave > 0 ? "border-warning/40 bg-warning-bg" : "border-border bg-surface"}`}>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Leave waiting for you</div>
          <div className="text-[24px] font-extrabold text-text">{waitingLeave}</div>
        </div>
        <div className={`rounded-xl border px-4 py-3 shadow-sm ${waitingOt > 0 ? "border-warning/40 bg-warning-bg" : "border-border bg-surface"}`}>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">OT waiting for you</div>
          <div className="text-[24px] font-extrabold text-text">{waitingOt}</div>
        </div>
      </div>

      <MonthFilter allowAll />

      <ListFilters keep={{ month: sp.month }} clearHref="/profile/team">
        <FilterField label="Show">
          <Select name="kind" defaultValue={kind} className={`${FILTER_INPUT} w-36`}>
            <option value="">Leave and OT</option>
            <option value="leave">Leave only</option>
            <option value="ot">OT only</option>
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={status} className={`${FILTER_INPUT} w-44`}>
            <option value="waiting">Waiting for me</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All statuses</option>
          </Select>
        </FilterField>
        <FilterField label="Staff name">
          <input name="q" defaultValue={sp.q ?? ""} className={`${FILTER_INPUT} w-44`} />
        </FilterField>
      </ListFilters>

      <p className="-mt-2 text-[13px] text-text-secondary">
        {staffCount > 0 ? `${staffCount} staff with leave or OT` : "Your staff have no leave or OT yet"} · <span className="font-semibold text-text">{periodLabel}</span>
      </p>

      {kind !== "ot" && (
        <SectionCard title={`Leave (${leave.length})`}>
          {leave.length === 0 ? (
            <EmptyRow text={status === "waiting" ? "No leave waiting for your approval." : "No leave requests for this filter."} />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {leave.map((l) => (
                <div key={l.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-text">
                      {l.name}
                      <span className="ml-2 font-normal text-text-secondary">{leaveTypeText(l.leave_type, l.leave_type_other)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-text-muted">
                      {day(l.start_date)} → {day(l.end_date)} · {Number(l.days)} day(s) · {l.company}
                    </div>
                    {l.reason && <div className="mt-0.5 text-xs text-text-secondary">{l.reason}</div>}
                    {l.document_id && <DocumentViewLink documentId={l.document_id} label="📎 MC / file" className="mt-0.5 text-xs" />}
                    {l.status !== "pending" && (
                      <div className="mt-1 text-xs font-semibold text-primary">
                        {l.status === "approved" ? "Approved" : l.status === "rejected" ? "Rejected" : LEAVE_STATUS_LABEL[l.status] ?? l.status}
                        {l.reviewed_by_name ? ` by ${l.reviewed_by_name}` : ""}
                        {l.reviewed_at ? ` · ${formatMalaysiaDate(l.reviewed_at)}` : ""}
                      </div>
                    )}
                    {l.remarks && <div className="mt-0.5 text-xs text-text-secondary">Remark: {l.remarks}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge tone={LEAVE_TONE[l.status] ?? "neutral"}>{LEAVE_STATUS_LABEL[l.status] ?? l.status}</StatusBadge>
                    {l.status === "pending" && <LeaveRowActions leaveId={l.id} withRemarks />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {kind !== "leave" && (
        <SectionCard title={`OT (${overtime.length})`}>
          {overtime.length === 0 ? (
            <EmptyRow text={status === "waiting" ? "No OT waiting for your approval." : "No OT for this filter."} />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {overtime.map((o) => (
                <div key={o.id} className="flex flex-col gap-3 px-5 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-text">
                        {o.name}
                        <span className="ml-2 font-normal text-text-secondary">
                          {formatHours(Number(o.hours))} · {day(o.work_date)}
                          {o.start && o.end ? ` · ${o.start.slice(0, 5)}–${o.end.slice(0, 5)}` : ""}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-text-muted">{o.reason || "No reason given"} · {o.company}</div>
                      {o.exceeds_limit && <div className="mt-0.5 text-xs font-semibold text-danger">Above the 104-hour monthly limit</div>}
                      {o.document_id && <DocumentViewLink documentId={o.document_id} label="📎 File" className="mt-0.5 text-xs" />}
                      {(o.status === "approved" || o.status === "rejected") && (
                        <div className="mt-1 text-xs font-semibold text-primary">
                          {o.status === "approved" ? `Approved${o.approved_hours !== null ? ` (${formatHours(Number(o.approved_hours))})` : ""}` : "Rejected"}
                          {o.reviewed_by_name ? ` by ${o.reviewed_by_name}` : ""}
                          {o.reviewed_at ? ` · ${formatMalaysiaDate(o.reviewed_at)}` : ""}
                        </div>
                      )}
                      {o.remarks && <div className="mt-0.5 text-xs text-text-secondary">Remark: {o.remarks}</div>}
                    </div>
                    <StatusBadge tone={OT_STATUS_TONE[o.status] ?? "neutral"}>{otWaiting(o.status) ? "Waiting for you" : OT_STATUS_LABEL[o.status] ?? o.status}</StatusBadge>
                  </div>
                  {otWaiting(o.status) && (
                    <div className="rounded-lg border border-border bg-bg p-3">
                      <OvertimeReviewPanel overtimeId={o.id} requestedHours={Number(o.hours)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
