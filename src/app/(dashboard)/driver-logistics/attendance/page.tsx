import { isModuleEditor } from "@/lib/moduleAccess";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { formatMalaysiaTime } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { EventClockForm } from "@/components/driver/EventClockForm";
import { EventSitesPanel } from "@/components/driver/EventSitesPanel";
import { CopyLink } from "@/components/driver/CopyLink";
import { MonthFilter } from "@/components/MonthFilter";
import { monthLabelOf } from "@/lib/monthFilter";
import { listEventAttendance, listEventSites, listEventSuggestions } from "@/lib/eventAttendance/queries";
import { EVENT_CLOCK_COMPANIES, slugForCompany, type StaffType } from "@/lib/eventAttendance/rules";
import { ROLE_LABEL, listEventDutyStaff } from "@/lib/eventAttendance/staff";

function formatTime(iso: string | null): string {
  return formatMalaysiaTime(iso);
}

/**
 * Attendance: the staff on duty at an event (the drivers and the foreign staff) clock in and out of it, within 100 m of the
 * event location. The same form is sent to them as a link (no login needed).
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ company?: string; date?: string; name?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, date: dateParam, name: nameParam, month } = await searchParams;
  const monthLabel = monthLabelOf(month);
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const adminFlags = await Promise.all(
    selectable.map(async (c) => {
      return [c.id, await isModuleEditor(supabase, c.id, "driver-logistics")] as const;
    }),
  );
  const adminCompanyIds = new Set(adminFlags.filter(([, isAdmin]) => isAdmin).map(([id]) => id));

  const [eventRows, eventSites, eventSuggestions, duty] = await Promise.all([
    listEventAttendance(supabase, targetCompanyIds, { date: dateParam || undefined, name: nameParam || undefined, month }),
    listEventSites(supabase, targetCompanyIds),
    listEventSuggestions(supabase, selectable.map((c) => c.id), todayInMalaysia()),
    listEventDutyStaff(supabase, selectable.map((c) => c.id)),
  ]);

  const clockCompanies = selectable.flatMap((c) => {
    const slug = slugForCompany(c.id);
    return slug ? [{ slug, name: c.name }] : [];
  });
  const staff = duty.flatMap((s) => {
    const slug = slugForCompany(s.companyId);
    return slug ? [{ id: s.id, name: s.name, companySlug: slug }] : [];
  });
  const metres = (m: number | null) => (m === null ? "—" : `${Math.round(Number(m))} m`);
  const checkLabel = (c: string | null) => (c === "verified" ? "Within 100 m" : c === "unverified" ? "Location not verified" : "—");

  const table = buildReportRows(
    eventRows,
    [
      { key: "name", label: "Name", exportValue: (r) => r.person_name },
      { key: "role", label: "Role", exportValue: (r) => ROLE_LABEL[r.staff_type as StaffType] ?? r.staff_type },
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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Attendance: the staff on duty at the event (drivers and foreign staff){monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
      </div>

      <DriverLogisticsSubNav />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="text-[15px] font-bold text-text">Staff on event duty: Clock In / Clock Out</div>
          <p className="text-[13px] text-text-secondary">Staff on duty at the event: choose your name, write the event location, then Clock In or Clock Out. You must be within 100 m of the event location.</p>
          <EventClockForm
            companies={clockCompanies}
            staff={staff}
            suggestions={eventSuggestions.flatMap((e) => {
              const slug = slugForCompany(e.companyId);
              return slug ? [{ name: e.name, location: e.location, companySlug: slug }] : [];
            })}
          />
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
        {requestedId && <input type="hidden" name="company" value={requestedId} />}
        {month && <input type="hidden" name="month" value={month} />}
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

      <MonthFilter />

      <ReportTable filenameBase={`event-attendance-${dateParam || month || "all"}`} headers={table.headers} rows={table.tableRows} emptyText={monthLabel ? "No event clock-in in this month." : "No event clock-ins yet."} />

      {adminCompanies.length > 0 && <EventSitesPanel sites={sites} companies={adminCompanies} knownLocations={knownLocations} />}
    </div>
  );
}
