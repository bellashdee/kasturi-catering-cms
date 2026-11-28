import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { todayInMalaysia } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { CalendarUndoBanner } from "@/components/catering/CalendarUndoBanner";
import { EventCalendarView } from "@/components/catering/EventCalendarView";
import { DateOnlyEventButton } from "@/components/catering/DateOnlyEventButton";
import { SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";
import { loadUpcomingJdt } from "@/lib/catering/jdtSchedule";
import { UpcomingJdtEvents } from "@/components/catering/UpcomingJdtEvents";
import { CALENDAR_VIEWS, PHASE_LABEL, addDays, dateLabel, loadCalendarEntries, monthStart, rangeOf, shiftMonth, startOfWeek, type CalendarView } from "@/lib/catering/calendar";

const VIEW_LABEL: Record<CalendarView, string> = { month: "Month", week: "Week", day: "Day", list: "Upcoming" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Event calendar of Catering: a quotation request from a sales agent appears here as soon as it comes in, then the event it becomes
 * (tentative while it is an enquiry / quoted, confirmed afterwards). Cancelled events are hidden unless asked for. Every entry can be
 * edited (save / cancel), cancelled (with undo) and deleted from here. Shown by month, week, day and as an upcoming list.
 */
export default async function CateringCalendarPage({ searchParams }: { searchParams: Promise<{ company?: string; view?: string; date?: string; tentative?: string; cancelled?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const sp = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;
  const query = sp.company ? `?company=${sp.company}` : "";
  const today = todayInMalaysia();
  const view: CalendarView = CALENDAR_VIEWS.includes(sp.view as CalendarView) ? (sp.view as CalendarView) : "month";
  const date = sp.date && DATE_RE.test(sp.date) && !Number.isNaN(Date.parse(`${sp.date}T00:00:00Z`)) ? sp.date : today;
  const showTentative = sp.tentative !== "0";
  const showCancelled = sp.cancelled === "1";
  const { start, end } = rangeOf(view, date);

  // everything the calendar needs is asked at the same time (not one after another), so it opens faster
  const [adminFlags, { data: canAddEvents }, jdtRows, all] = await Promise.all([
    Promise.all(
      targetCompanyIds.map(async (id) => {
        const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: id });
        return [id, data === true] as const;
      }),
    ),
    // a date-only event (JDT match) is added by the Quotation Request people, for Signature Solution only
    supabase.rpc("user_has_quotation_request_access"),
    // UPCOMING JDT EVENTS (Signature Solution): shown on the Event Calendar only
    targetCompanyIds.includes(SIGNATURE_COMPANY_ID) ? loadUpcomingJdt(today).catch(() => []) : Promise.resolve([]),
    loadCalendarEntries(supabase, targetCompanyIds, start, end, today),
  ]);
  const adminCompanyIds = adminFlags.filter(([, isAdmin]) => isAdmin).map(([id]) => id);
  const canAddDateOnly = canAddEvents === true && targetCompanyIds.includes(SIGNATURE_COMPANY_ID);
  const entries = all.filter((e) => (e.phase !== "tentative" || showTentative) && (e.phase !== "cancelled" || showCancelled));
  const hiddenCancelled = all.filter((e) => e.phase === "cancelled").length;

  const params = (v: CalendarView, d: string, extra: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams();
    if (sp.company) q.set("company", sp.company);
    q.set("view", v);
    q.set("date", d);
    if (!showTentative) q.set("tentative", "0");
    if (showCancelled) q.set("cancelled", "1");
    for (const [k, val] of Object.entries(extra)) {
      if (val === undefined) q.delete(k);
      else q.set(k, val);
    }
    return `/catering/calendar?${q.toString()}`;
  };
  const eventHref = (id: string) => `/catering/${id}${sp.company ? `?company=${sp.company}` : ""}`;

  const prev = view === "month" ? shiftMonth(date, -1) : view === "week" ? addDays(date, -7) : view === "day" ? addDays(date, -1) : addDays(date, -30);
  const next = view === "month" ? shiftMonth(date, 1) : view === "week" ? addDays(date, 7) : view === "day" ? addDays(date, 1) : addDays(date, 30);
  const title =
    view === "month"
      ? dateLabel(monthStart(date), { month: "long", year: "numeric" })
      : view === "week"
        ? `${dateLabel(startOfWeek(date), { day: "numeric", month: "short" })} – ${dateLabel(addDays(startOfWeek(date), 6), { day: "numeric", month: "short", year: "numeric" })}`
        : view === "day"
          ? dateLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
          : `${dateLabel(date, { day: "numeric", month: "short" })} – ${dateLabel(addDays(date, 30), { day: "numeric", month: "short", year: "numeric" })}`;

  // the counts are of EVENTS (a multi-day event once) inside the period shown: in the month view the grid also shows days of the weeks
  // before and after, which are not counted, so the numbers tally with the Event P&L and the reports of the same month
  const inPeriod = view === "month" ? entries.filter((e) => e.date.slice(0, 7) === monthStart(date).slice(0, 7)) : entries;
  const countEvents = (list: typeof entries) => new Set(list.map((e) => (e.kind === "request" ? `r:${e.requestId ?? e.key}` : `e:${e.eventId}`))).size;
  // confirmed = confirmed, in production, ready for planning, delivered and completed (an event that has taken place is still a confirmed one)
  const confirmed = countEvents(inPeriod.filter((e) => e.phase === "confirmed" || e.phase === "finished"));
  const tentative = countEvents(inPeriod.filter((e) => e.phase === "tentative"));
  const dateOnly = countEvents(inPeriod.filter((e) => e.phase === "date" || e.phase === "pending"));
  const requests = countEvents(inPeriod.filter((e) => e.phase === "request"));
  const alerts = entries.filter((e) => e.alert).length;
  const btn = "rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-semibold text-text hover:bg-surface-alt";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Catering Events</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Event Calendar — quotation requests, tentative bookings and confirmed events, by month, week and day</p>
      </div>

      <CateringSubNav />

      <CalendarUndoBanner />

      {(canAddDateOnly || jdtRows.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {canAddDateOnly && <DateOnlyEventButton query={query} />}
          {jdtRows.length > 0 && (
            <a href="#upcoming-jdt" className="text-[13px] font-semibold text-blue-800 hover:underline">
              {`${jdtRows.length} upcoming JDT date(s) — see the list under the calendar ↓`}
            </a>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={params(view, prev)} className={btn} aria-label="Previous">
            ←
          </Link>
          <Link href={params(view, today)} className={btn}>
            Today
          </Link>
          <Link href={params(view, next)} className={btn} aria-label="Next">
            →
          </Link>
          <h2 className="ml-2 text-[17px] font-extrabold text-text">{title}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CALENDAR_VIEWS.map((v) => (
            <Link key={v} href={params(v, date)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${v === view ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}>
              {VIEW_LABEL[v]}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-text-secondary">
        <span className="font-semibold text-text">{`${confirmed} confirmed`}</span>
        <span>{`${tentative} tentative`}</span>
        {dateOnly > 0 && <span className="font-semibold text-blue-700">{`${dateOnly} date only (menu & pax pending)`}</span>}
        <span>{`Quotation requests waiting: ${requests}`}</span>
        {alerts > 0 && <span className="font-bold text-danger">{`⚠ ${alerts} need attention`}</span>}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border-l-[3px] border-dotted border-info bg-info-bg/60" /> {PHASE_LABEL.request}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border-l-[3px] border-success bg-success-bg" /> {PHASE_LABEL.confirmed}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border-l-[3px] border-dashed border-warning bg-warning-bg/60" /> {PHASE_LABEL.tentative}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border-l-[4px] border-blue-600 bg-blue-100" /> {PHASE_LABEL.date}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border-l-[4px] border-yellow-500 bg-yellow-100" /> {PHASE_LABEL.pending}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border-l-[3px] border-border-strong bg-surface-alt" /> {PHASE_LABEL.finished}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border-l-[3px] border-danger bg-danger-bg/60" /> {PHASE_LABEL.cancelled}
        </span>
        <Link href={params(view, date, { tentative: showTentative ? "0" : undefined })} className="font-semibold text-primary hover:underline">
          {showTentative ? "Hide tentative" : "Show tentative"}
        </Link>
        <Link href={params(view, date, { cancelled: showCancelled ? undefined : "1" })} className="font-semibold text-primary hover:underline">
          {showCancelled ? "Hide cancelled" : `Show cancelled${hiddenCancelled ? ` (${hiddenCancelled})` : ""}`}
        </Link>
      </div>

      <EventCalendarView view={view} date={date} today={today} entries={entries} href={(v, d) => params(v, d)} eventHref={eventHref} adminCompanyIds={adminCompanyIds} query={query} />

      {jdtRows.length > 0 && (
        <div id="upcoming-jdt">
          <UpcomingJdtEvents rows={jdtRows} canOpen query={query} />
        </div>
      )}
    </div>
  );
}
