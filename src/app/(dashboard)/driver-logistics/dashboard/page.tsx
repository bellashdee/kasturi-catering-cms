import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listActiveDriversForCompanies } from "@/lib/driverAttendance/queries";
import { computeAttendanceStatus, ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE } from "@/lib/driver/constants";
import { EmptyRow, SectionCard, StatRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { formatMalaysiaTime } from "@/lib/format";
import { LiveClock } from "@/components/layout/LiveClock";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { Select } from "@/components/ui/Select";

function formatTime(iso: string | null): string {
  return formatMalaysiaTime(iso);
}

function workingHours(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn) return "—";
  const end = clockOut ? new Date(clockOut) : new Date();
  const hours = (end.getTime() - new Date(clockIn).getTime()) / 3_600_000;
  return `${hours.toFixed(1)} hrs${clockOut ? "" : " (ongoing)"}`;
}

export default async function DriverDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; driver?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, driver: driverParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const driverProfiles = await listActiveDriversForCompanies(supabase, targetCompanyIds);
  const drivers = driverProfiles.filter((d) => d.employees).map((d) => ({ id: d.employee_id, full_name: d.employees!.full_name }));
  const driverId = driverParam && drivers.some((d) => d.id === driverParam) ? driverParam : drivers[0]?.id;

  if (!driverId) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">Driver Dashboard</p>
        </div>
        <DriverLogisticsSubNav />
        <EmptyRow text="No active drivers yet — add one under Drivers first." />
      </div>
    );
  }

  const driverProfile = driverProfiles.find((d) => d.employee_id === driverId)!;
  const today = todayInMalaysia();

  const [{ data: attendance }, { data: todayDeliveries }] = await Promise.all([
    supabase.from("driver_attendance").select("*").eq("driver_id", driverId).eq("attendance_date", today).maybeSingle(),
    supabase
      .from("deliveries")
      .select("id, status, proof_status, scheduled_time, location, catering_events(event_name, location)")
      .eq("driver_id", driverId)
      .in("company_id", targetCompanyIds)
      .gte("scheduled_time", `${today}T00:00:00+08:00`)
      .lte("scheduled_time", `${today}T23:59:59.999+08:00`),
  ]);

  const deliveries = todayDeliveries ?? [];
  const attendanceStatus = attendance
    ? computeAttendanceStatus(attendance, driverProfile.expected_clock_in_time)
    : computeAttendanceStatus({ attendance_date: today, clock_in_time: null, clock_out_time: null, is_off_day: false }, driverProfile.expected_clock_in_time);

  const taskCounts = {
    total: deliveries.length,
    pending: deliveries.filter((d) => d.status === "scheduled").length,
    inProgress: deliveries.filter((d) => d.status === "in_transit").length,
    completed: deliveries.filter((d) => d.status === "delivered").length,
    requiresProof: deliveries.filter((d) => d.status !== "cancelled" && d.status !== "delivered" && d.proof_status === "no_proof").length,
  };

  const deliverySummary = {
    scheduled: deliveries.filter((d) => d.status === "scheduled").length,
    completed: deliveries.filter((d) => d.status === "delivered").length,
    pending: deliveries.filter((d) => d.status === "scheduled" || d.status === "in_transit").length,
    proofUploaded: deliveries.filter((d) => d.proof_status === "proof_uploaded" || d.proof_status === "completed").length,
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Driver Dashboard — <LiveClock variant="date" /></p>
      </div>

      <DriverLogisticsSubNav />

      <form method="get" className="flex items-end gap-3">
        {requestedId && <input type="hidden" name="company" value={requestedId} />}
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Driver</label>
          <Select name="driver" defaultValue={driverId} className="mt-1 h-9 w-64 rounded-lg border border-border-strong px-2 text-[13px]">
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </Select>
        </div>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">View</button>
      </form>

      <div className="grid grid-cols-3 gap-4">
        <SectionCard title="Today's Attendance">
          <StatRow label="Clock In" value={formatTime(attendance?.clock_in_time ?? null)} />
          <StatRow label="Clock In Photo" value={attendance?.clock_in_document_id ? <DocumentViewLink documentId={attendance.clock_in_document_id} /> : "—"} />
          <StatRow label="Clock Out" value={formatTime(attendance?.clock_out_time ?? null)} />
          <StatRow label="Clock Out Photo" value={attendance?.clock_out_document_id ? <DocumentViewLink documentId={attendance.clock_out_document_id} /> : "—"} />
          <StatRow label="Working Hours" value={workingHours(attendance?.clock_in_time ?? null, attendance?.clock_out_time ?? null)} />
          <div className="mt-2">
            <StatusBadge tone={ATTENDANCE_STATUS_TONE[attendanceStatus]}>{ATTENDANCE_STATUS_LABEL[attendanceStatus]}</StatusBadge>
          </div>
        </SectionCard>

        <SectionCard title="Today's Tasks">
          <StatRow label="Total Tasks" value={taskCounts.total} />
          <StatRow label="Pending" value={taskCounts.pending} />
          <StatRow label="In Progress" value={taskCounts.inProgress} />
          <StatRow label="Completed" value={taskCounts.completed} />
          <StatRow label="Requiring Proof" value={taskCounts.requiresProof} />
        </SectionCard>

        <SectionCard title="Delivery Summary">
          <StatRow label="Scheduled Deliveries" value={deliverySummary.scheduled} />
          <StatRow label="Pending Deliveries" value={deliverySummary.pending} />
          <StatRow label="Completed Deliveries" value={deliverySummary.completed} />
          <StatRow label="Proof Uploaded" value={deliverySummary.proofUploaded} />
        </SectionCard>
      </div>

      <SectionCard title="Today's Delivery Tasks">
        {deliveries.length === 0 ? (
          <EmptyRow text="No deliveries scheduled today." />
        ) : (
          <div className="flex flex-col gap-2">
            {deliveries.map((d) => (
              <a key={d.id} href={`/driver-logistics/${d.id}${query}`} className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5 text-[13px] hover:bg-bg">
                <div>
                  <div className="font-semibold text-text">{d.catering_events?.event_name ?? d.location ?? "Delivery"}</div>
                  <div className="text-[11.5px] text-text-muted">{formatMalaysiaTime(d.scheduled_time)}{(d.catering_events?.location ?? d.location) && ` · ${d.catering_events?.location ?? d.location}`}</div>
                </div>
                <StatusBadge tone={d.status === "delivered" ? "success" : d.status === "cancelled" ? "danger" : "warning"}>{d.status}</StatusBadge>
              </a>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
