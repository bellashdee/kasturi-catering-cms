import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listAttendance, listActiveDriversForCompanies } from "@/lib/driverAttendance/queries";
import { computeAttendanceStatus, ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE } from "@/lib/driver/constants";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { ClockInOutWidget } from "@/components/driver/ClockInOutWidget";
import { AttendanceCorrectionAction } from "@/components/driver/AttendanceCorrectionAction";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
}

export default async function DriverAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; driver?: string; date?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, driver: driverParam, date: dateParam } = await searchParams;
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const [attendance, driverProfiles] = await Promise.all([
    listAttendance(supabase, targetCompanyIds, { driverName: driverParam || undefined, date: dateParam || undefined }),
    listActiveDriversForCompanies(supabase, targetCompanyIds),
  ]);

  const expectedClockInByDriver = new Map(driverProfiles.map((d) => [d.employee_id, d.expected_clock_in_time]));
  const expectedFor = (driverId: string | null) => (driverId ? expectedClockInByDriver.get(driverId) : undefined) ?? "08:00:00";

  const missingToday = attendance.filter((a) => {
    const isToday = a.attendance_date === new Date().toISOString().slice(0, 10);
    const status = computeAttendanceStatus(a, expectedFor(a.driver_id));
    return isToday && (status === "missing_clock_in" || status === "missing_clock_out");
  });

  const { headers, tableRows } = buildReportRows(
    attendance,
    [
      { key: "driver", label: "Driver", exportValue: (r) => r.driver_name ?? "—" },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      { key: "date", label: "Date", exportValue: (r) => r.attendance_date },
      { key: "clockIn", label: "Clock In", exportValue: (r) => formatTime(r.clock_in_time) },
      {
        key: "clockInPhoto",
        label: "Clock In Photo",
        exportValue: (r) => (r.clock_in_document_id ? "Photo on file" : "—"),
        display: (r) => (r.clock_in_document_id ? <DocumentViewLink documentId={r.clock_in_document_id} /> : <span className="text-text-muted">—</span>),
      },
      { key: "clockOut", label: "Clock Out", exportValue: (r) => formatTime(r.clock_out_time) },
      {
        key: "clockOutPhoto",
        label: "Clock Out Photo",
        exportValue: (r) => (r.clock_out_document_id ? "Photo on file" : "—"),
        display: (r) => (r.clock_out_document_id ? <DocumentViewLink documentId={r.clock_out_document_id} /> : <span className="text-text-muted">—</span>),
      },
      {
        key: "status",
        label: "Status",
        exportValue: (r) => ATTENDANCE_STATUS_LABEL[computeAttendanceStatus(r, expectedFor(r.driver_id))],
        display: (r) => {
          const status = computeAttendanceStatus(r, expectedFor(r.driver_id));
          return (
            <div className="flex flex-col gap-0.5">
              <StatusBadge tone={ATTENDANCE_STATUS_TONE[status]}>{ATTENDANCE_STATUS_LABEL[status]}</StatusBadge>
              {r.is_corrected && <span className="text-[10.5px] text-text-muted">Corrected · {r.correction_reason}</span>}
            </div>
          );
        },
      },
      {
        key: "action",
        label: "Action",
        exportValue: () => "",
        display: (r) => (
          <AttendanceCorrectionAction attendanceId={r.id} companyId={r.company_id} clockInTime={r.clock_in_time} clockOutTime={r.clock_out_time} />
        ),
      },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Attendance</p>
      </div>

      <DriverLogisticsSubNav />

      {missingToday.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-bg px-4 py-3">
          <span className="text-lg">🔴</span>
          <div className="text-[13px] font-semibold text-danger">
            {missingToday.length} driver{missingToday.length === 1 ? " has" : "s have"} a missing clock-in or clock-out today.
          </div>
        </div>
      )}

      <ClockInOutWidget companies={selectable} />

      <form method="get" className="flex flex-wrap items-end gap-3">
        {requestedId && <input type="hidden" name="company" value={requestedId} />}
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Driver</label>
          <input
            type="text"
            name="driver"
            defaultValue={driverParam ?? ""}
            placeholder="Search by name…"
            className="mt-1 h-9 w-56 rounded-lg border border-border-strong px-2 text-[13px]"
          />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Date</label>
          <input type="date" name="date" defaultValue={dateParam ?? ""} className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
      </form>

      <ReportTable filenameBase={`driver-attendance-${dateParam || "all"}`} headers={headers} rows={tableRows} emptyText="No attendance records yet." />
    </div>
  );
}
