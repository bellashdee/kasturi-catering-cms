import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listAttendance, listActiveDriversForCompanies } from "@/lib/driverAttendance/queries";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { formatMalaysiaTime } from "@/lib/format";
import { computeAttendanceStatus, ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE } from "@/lib/driver/constants";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { ClockInOutWidget } from "@/components/driver/ClockInOutWidget";
import { AttendanceCorrectionAction } from "@/components/driver/AttendanceCorrectionAction";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import Link from "next/link";
import { EventClockForm } from "@/components/driver/EventClockForm";
import { EventSitesPanel } from "@/components/driver/EventSitesPanel";
import { CopyLink } from "@/components/driver/CopyLink";
import { listEventAttendance, listEventSites, listEventSuggestions } from "@/lib/eventAttendance/queries";
import { EVENT_CLOCK_COMPANIES, STAFF_TYPE_LABEL, slugForCompany, type StaffType } from "@/lib/eventAttendance/rules";

function formatTime(iso: string | null): string {
  return formatMalaysiaTime(iso);
}

export default async function DriverAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; driver?: string; date?: string; tab?: string; name?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, driver: driverParam, date: dateParam, tab: tabParam, name: nameParam } = await searchParams;
  // The staff on duty at an event clock in and out of it (within 100 m of the event location); company staff keep the original form
  const tab: "driver" | "staff" = tabParam === "staff" ? "staff" : "driver";
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const [attendance, driverProfiles] = await Promise.all([
    listAttendance(supabase, targetCompanyIds, { driverName: driverParam || undefined, date: dateParam || undefined }),
    listActiveDriversForCompanies(supabase, targetCompanyIds),
  ]);

  // The clock in/out dropdown lists the central driver records. An admin of a company can pick any driver in it;
  // everyone else only sees the record(s) linked to their own login, so nobody can clock in as someone else.
  const driversInSelectable = await listActiveDriversForCompanies(supabase, selectable.map((c) => c.id));
  const adminFlags = await Promise.all(
    selectable.map(async (c) => {
      const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: c.id });
      return [c.id, data === true] as const;
    }),
  );
  const adminCompanyIds = new Set(adminFlags.filter(([, isAdmin]) => isAdmin).map(([id]) => id));
  const clockDrivers = driversInSelectable
    .filter((d) => adminCompanyIds.has(d.company_id) || d.user_id === session.userId || d.employees?.user_id === session.userId)
    .map((d) => ({ profileId: d.id, name: d.employees?.full_name ?? "", companyId: d.company_id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const eventTab = tab !== "staff";
  const staffType: StaffType = "driver";
  const [eventRows, eventSites, eventSuggestions] = eventTab
    ? await Promise.all([
        listEventAttendance(supabase, targetCompanyIds, { staffType, date: dateParam || undefined, name: nameParam || undefined }),
        listEventSites(supabase, targetCompanyIds),
        listEventSuggestions(supabase, selectable.map((c) => c.id), todayInMalaysia()),
      ])
    : [[], [], []];
  const clockCompanies = selectable.flatMap((c) => {
    const slug = slugForCompany(c.id);
    return slug ? [{ slug, name: c.name }] : [];
  });
  const eventDrivers = driversInSelectable.map((d) => ({ id: d.id, name: d.employees?.full_name ?? "", companySlug: slugForCompany(d.company_id) ?? "" })).filter((d) => d.companySlug).sort((a, b) => a.name.localeCompare(b.name));
  const tabHref = (t: string) => `/driver-logistics/attendance?tab=${t}${requestedId ? `&company=${requestedId}` : ""}`;
  const metres = (m: number | null) => (m === null ? "—" : `${Math.round(Number(m))} m`);
  const checkLabel = (c: string | null) => (c === "verified" ? "Within 100 m" : c === "unverified" ? "Location not verified" : "—");

  const expectedClockInByDriver = new Map(driverProfiles.map((d) => [d.employee_id, d.expected_clock_in_time]));
  const expectedFor = (driverId: string | null) => (driverId ? expectedClockInByDriver.get(driverId) : undefined) ?? "08:00:00";

  const missingToday = attendance.filter((a) => {
    const isToday = a.attendance_date === todayInMalaysia();
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


  const eventTableData = buildReportRows(
    eventRows,
    [
      { key: "name", label: "Name", exportValue: (r) => r.person_name },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      { key: "date", label: "Date", exportValue: (r) => r.attendance_date },
      { key: "event", label: "Event", exportValue: (r) => r.event_name },
      { key: "location", label: "Event location", exportValue: (r) => r.event_location },
      { key: "in", label: "Clock In", exportValue: (r) => formatTime(r.clock_in_time) },
      { key: "inDist", label: "Distance at clock in", exportValue: (r) => metres(r.clock_in_distance_m) },
      { key: "out", label: "Clock Out", exportValue: (r) => formatTime(r.clock_out_time) },
      { key: "outDist", label: "Distance at clock out", exportValue: (r) => metres(r.clock_out_distance_m) },
      {
        key: "check",
        label: "Location check",
        exportValue: (r) => checkLabel(r.clock_in_check),
        display: (r) => <StatusBadge tone={r.clock_in_check === "verified" ? "success" : "warning"}>{checkLabel(r.clock_in_check)}</StatusBadge>,
      },
      {
        key: "status",
        label: "Status",
        exportValue: (r) => (r.clock_out_time ? "Completed" : "Still clocked in"),
        display: (r) => <StatusBadge tone={r.clock_out_time ? "success" : "info"}>{r.clock_out_time ? "Completed" : "Still clocked in"}</StatusBadge>,
      },
    ],
    (r) => r.id,
  );

  const sites = eventSites.map((x) => ({ id: x.id, companyId: x.company_id, companyName: x.companies?.name ?? "—", locationText: x.location_text, latitude: x.latitude, longitude: x.longitude, source: x.source }));
  const adminCompanies = selectable.filter((c) => adminCompanyIds.has(c.id));
  const knownLocations = [...eventSites.map((x) => ({ companyId: x.company_id, text: x.location_text })), ...eventRows.map((x) => ({ companyId: x.company_id, text: x.event_location }))];
  const tabs: { key: string; label: string; active: boolean }[] = [
    { key: "driver", label: STAFF_TYPE_LABEL.driver, active: tab === "driver" },
    { key: "staff", label: "Company staff (clock in / out with photo)", active: tab === "staff" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Attendance</p>
      </div>

      <DriverLogisticsSubNav />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Who is clocking in">
        {tabs.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} role="tab" aria-selected={t.active} className={`rounded-lg border px-4 py-2 text-[13.5px] font-bold ${t.active ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text-secondary hover:text-text"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {eventTab ? (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
              <div className="text-[15px] font-bold text-text">{STAFF_TYPE_LABEL[staffType]}: Clock In / Clock Out</div>
              <p className="text-[13px] text-text-secondary">
                Staff on duty at the event: choose your name, write the event name and location, then Clock In or Clock Out. You must be within 100 m of the event location.
              </p>
              <EventClockForm companies={clockCompanies} drivers={eventDrivers} suggestions={eventSuggestions.flatMap((e) => { const slug = slugForCompany(e.companyId); return slug ? [{ name: e.name, location: e.location, companySlug: slug }] : []; })} />
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
              <div className="text-[15px] font-bold text-text">Link for the staff on event duty (no login needed)</div>
              <p className="text-[13px] text-text-secondary">Send this link on WhatsApp. The staff on duty open it on their phone and clock in and out of the event themselves.</p>
              {selectable.flatMap((c) => {
                const slug = slugForCompany(c.id);
                return slug && EVENT_CLOCK_COMPANIES[slug] ? [<CopyLink key={slug} path={`/event-clock/${slug}`} label={c.name} />] : [];
              })}
            </div>
          </div>

          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value={tabParam ?? "driver"} />
            {requestedId && <input type="hidden" name="company" value={requestedId} />}
            <div>
              <label className="text-[12px] font-semibold text-text-secondary">Name</label>
              <input name="name" defaultValue={nameParam ?? ""} className="mt-1 h-9 w-56 rounded-lg border border-border-strong px-2 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-text-secondary">Date</label>
              <input type="date" name="date" defaultValue={dateParam ?? ""} className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]" />
            </div>
            <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
          </form>

          <ReportTable filenameBase={`event-attendance-${staffType}-${dateParam || "all"}`} headers={eventTableData.headers} rows={eventTableData.tableRows} emptyText="No event clock-ins yet." />

          {adminCompanies.length > 0 && <EventSitesPanel sites={sites} companies={adminCompanies} knownLocations={knownLocations} />}
        </>
      ) : (
        <>
          {missingToday.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-bg px-4 py-3">
              <span className="text-lg">🔴</span>
              <div className="text-[13px] font-semibold text-danger">
                {`Drivers with a missing clock-in or clock-out today: ${missingToday.length}`}
              </div>
            </div>
          )}

          <ClockInOutWidget companies={selectable} drivers={clockDrivers} />

          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value="staff" />
            {requestedId && <input type="hidden" name="company" value={requestedId} />}
            <div>
              <label className="text-[12px] font-semibold text-text-secondary">Driver</label>
              <select name="driver" defaultValue={driverParam ?? ""} className="mt-1 h-9 w-56 rounded-lg border border-border-strong px-2 text-[13px]">
                <option value="">All drivers</option>
                {Array.from(new Set(driversInSelectable.map((d) => d.employees?.full_name).filter((n): n is string => !!n))).sort().map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-text-secondary">Date</label>
              <input type="date" name="date" defaultValue={dateParam ?? ""} className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]" />
            </div>
            <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
          </form>

          <ReportTable filenameBase={`driver-attendance-${dateParam || "all"}`} headers={headers} rows={tableRows} emptyText="No attendance records yet." />
        </>
      )}
    </div>
  );
}
