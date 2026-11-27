import Link from "next/link";
import { EVENT_STATUS_LABEL, JDT_EVENT_TYPE, MEAL_TYPE_LABEL } from "@/lib/catering/constants";
import { addDays, dateLabel, monthGrid, startOfWeek, type CalendarEntry, type CalendarView, type EventPhase } from "@/lib/catering/calendar";
import { CalendarEntryActions } from "@/components/catering/CalendarEntryActions";
import { formatTime12 } from "@/lib/format";

const PHASE_STYLE: Record<EventPhase, string> = {
  request: "border-l-[3px] border-dotted border-info bg-info-bg/60 text-text",
  confirmed: "border-l-[3px] border-success bg-success-bg text-text",
  tentative: "border-l-[3px] border-dashed border-warning bg-warning-bg/60 text-text",
  date: "border-l-[4px] border-blue-600 bg-blue-100 text-text",
  pending: "border-l-[4px] border-yellow-500 bg-yellow-100 text-text",
  finished: "border-l-[3px] border-border-strong bg-surface-alt text-text-secondary",
  cancelled: "border-l-[3px] border-danger bg-danger-bg/60 text-text-muted line-through",
};

const PHASE_MARK: Record<EventPhase, string> = { request: "✉", confirmed: "●", tentative: "◌", date: "◆", pending: "◇", finished: "✓", cancelled: "✕" };

/** A date-only entry (Date Confirmed / Details Pending): the date is known, the menu and pax are not yet. */
const isDateOnly = (e: CalendarEntry) => e.phase === "date" || e.phase === "pending";
/** An away match kept on the calendar for information only (no catering). */
const isAway = (e: CalendarEntry) => /\bAWAY\b/i.test(e.eventName);

/** "JDT MATCH – DATE CONFIRMED" (or the event name for another date-only event). */
function dateOnlyHeadline(e: CalendarEntry): string {
  const what = e.eventType === JDT_EVENT_TYPE ? "JDT MATCH" : e.eventName.toUpperCase();
  return `${what} – ${isAway(e) ? "AWAY (NO CATERING)" : e.phase === "date" ? "DATE CONFIRMED" : "DETAILS PENDING"}`;
}

/** The match itself, e.g. "JDT FC vs KL CITY FC" from "JDT Match – JDT FC vs KL CITY FC". */
const matchDetail = (e: CalendarEntry) => e.eventName.replace(/^JDT Match\s*[–-]\s*/i, "").replace(/^AWAY:\s*/i, "").replace(/\s*\(no catering\)$/i, "");

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  view: CalendarView;
  date: string;
  today: string;
  entries: CalendarEntry[];
  /** builds the link of a date in a view, keeping the company and the filters */
  href: (view: CalendarView, date: string) => string;
  /** link to an event, keeping the company */
  eventHref: (eventId: string) => string;
  /** the companies whose events the signed-in person may delete (company admins) */
  adminCompanyIds: string[];
  /** "?company=..." or "" */
  query: string;
};

const QUOTATION_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", rejected: "Rejected" };

function groupByDate(entries: CalendarEntry[]) {
  const map = new Map<string, CalendarEntry[]>();
  for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return map;
}

function totalPax(list: CalendarEntry[]) {
  return list.filter((e) => e.phase !== "cancelled").reduce((t, e) => t + e.pax, 0);
}

const mealsText = (e: CalendarEntry) => (e.mealTypes.length > 0 ? `${e.mealTypes.length} meal${e.mealTypes.length === 1 ? "" : "s"}` : "");

/** What a date of the month shows for an event: who ordered it, how many pax and how many meals. The full detail opens when the date is pressed. */
function Chip({ e, eventHref, plain = false }: { e: CalendarEntry; eventHref: Props["eventHref"]; plain?: boolean }) {
  const title = `${e.customerName ? `${e.customerName} · ` : ""}${e.eventName} · ${e.kind === "request" ? "Quotation request" : EVENT_STATUS_LABEL[e.status] ?? e.status} · ${e.pax} pax${e.venue ? ` · ${e.venue}` : ""}`;
  const className = `block rounded px-1.5 py-1 text-[11.5px] font-semibold leading-tight ${plain ? "" : "hover:opacity-80"} ${PHASE_STYLE[e.phase]}`;
  const detail = [e.pax > 0 ? `${e.pax} pax` : "", mealsText(e), formatTime12(e.eventTime)].filter(Boolean).join(" · ");
  const body = isDateOnly(e) ? (
    <>
      <span className="block truncate">
        <span aria-hidden="true">{PHASE_MARK[e.phase]} </span>
        {dateOnlyHeadline(e)}
      </span>
      <span className="block truncate text-[10.5px] font-medium opacity-80">{[matchDetail(e), formatTime12(e.eventTime)].filter(Boolean).join(" · ")}</span>
      {!isAway(e) && <span className="block truncate text-[10.5px] font-semibold opacity-80">Menu: Pending · Pax: Pending</span>}
    </>
  ) : (
    <>
      <span className="block truncate">
        <span aria-hidden="true">{PHASE_MARK[e.phase]} </span>
        {e.customerName || e.eventName}
        {e.alert ? " ⚠" : ""}
      </span>
      {detail && <span className="block truncate text-[10.5px] font-medium opacity-80">{detail}</span>}
    </>
  );
  if (plain) return <div title={title} className={className}>{body}</div>;
  return (
    <Link href={e.kind === "request" ? "/catering/quotation-requests" : eventHref(e.eventId)} title={title} className={className}>
      {body}
    </Link>
  );
}

function EntryCard({ e, eventHref, canDelete, query }: { e: CalendarEntry; eventHref: Props["eventHref"]; canDelete: boolean; query: string }) {
  return (
    <div className={`rounded-xl px-4 py-3 shadow-sm ${PHASE_STYLE[e.phase]} ${e.phase === "cancelled" ? "" : "border border-border"}`}>
      <Link href={e.kind === "request" ? `/catering/quotation-requests${query}` : eventHref(e.eventId)} className="block hover:opacity-90">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-extrabold">{e.customerName && e.customerName.trim().toUpperCase() !== e.eventName.trim().toUpperCase() ? `${e.customerName} — ${e.eventName}` : e.eventName}</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[11.5px] font-bold text-text-secondary">{e.kind === "request" ? "Quotation request" : EVENT_STATUS_LABEL[e.status] ?? e.status}</span>
          {e.quotation && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-[11.5px] font-semibold text-text-secondary">{`Quotation ${e.quotation.number} · ${QUOTATION_LABEL[e.quotation.status] ?? e.quotation.status}`}</span>
          )}
          {e.dayNumber && e.dayCount > 1 && <span className="text-[12px] text-text-muted">{`Day ${e.dayNumber} of ${e.dayCount}`}</span>}
          <span className="ml-auto text-[12px] text-text-muted">{e.companyName}</span>
        </div>
        {isDateOnly(e) && (
          <div className="mt-1.5 text-[13px] font-bold text-text">
            {dateOnlyHeadline(e)}
            <span className="ml-2 font-semibold text-text-secondary">{matchDetail(e)}</span>
          </div>
        )}
        {isDateOnly(e) ? (
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-text-secondary sm:grid-cols-4">
            <span>{`Menu: ${isAway(e) ? "No catering" : e.menu ? "Received" : "Pending"}`}</span>
            <span>{`Pax: ${isAway(e) ? "No catering" : e.pax > 0 ? e.pax : "Pending"}`}</span>
            <span>{`${e.eventType === JDT_EVENT_TYPE ? "Kick-off" : "Time"}: ${e.eventTime ? formatTime12(e.eventTime) : "Not provided"}`}</span>
            <span>{`Customer: ${e.customerName || "—"}`}</span>
          </div>
        ) : (
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-text-secondary sm:grid-cols-4">
          <span>{`Customer: ${e.customerName || "—"}`}</span>
          <span>{`Pax: ${e.pax > 0 ? e.pax : "—"}`}</span>
          <span>{`Food ready: ${e.eventTime ? formatTime12(e.eventTime) : "—"}`}</span>
          <span>{`Set-up (kitchen): ${e.setupTime ? formatTime12(e.setupTime) : "—"}`}</span>
          <span>{`Kitchen PIC: ${e.pic || "—"}`}</span>
        </div>
        )}
        {e.venue && <div className="mt-1 text-[12.5px] text-text-secondary">{`Venue: ${e.venue}`}</div>}
        {e.mealTypes.length > 0 && <div className="mt-1 text-[12.5px] text-text-secondary">{`Meals (${e.mealTypes.length}): ${e.mealTypes.map((m) => MEAL_TYPE_LABEL[m] ?? m).join(", ")}`}</div>}
        {e.menu && <div className="mt-1 whitespace-pre-line text-[12.5px] text-text">{e.menu}</div>}
        {e.alert && <div className="mt-1.5 text-[12.5px] font-bold text-danger">{`⚠ ${e.alert}`}</div>}
      </Link>
      <CalendarEntryActions
        key={`${e.key}:${e.date}:${e.eventTime}:${e.setupTime}:${e.pax}:${e.status}`}
        entry={{ kind: e.kind, eventId: e.eventId, requestId: e.requestId, dayId: e.dayId, status: e.status, eventName: e.eventName, date: e.date, eventTime: e.eventTime, setupTime: e.setupTime, venue: e.venue, pax: e.pax, twoServices: e.twoServices }}
        canDelete={canDelete && e.kind === "event"}
        canQuickEdit={!isDateOnly(e)}
        query={query}
      />
    </div>
  );
}

export function EventCalendarView({ view, date, today, entries, href, eventHref, adminCompanyIds, query }: Props) {
  const byDate = groupByDate(entries);

  if (view === "month") {
    const weeks = monthGrid(date);
    const month = date.slice(0, 7);
    return (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-border bg-surface-alt text-center text-[11px] font-bold uppercase tracking-wide text-text-muted">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 border-b border-border last:border-b-0">
              {week.map((d) => {
                const list = byDate.get(d) ?? [];
                const inMonth = d.startsWith(month);
                return (
                  <Link
                    key={d}
                    href={href("day", d)}
                    title="Open this date to see every event of the day"
                    className={`block min-h-[104px] border-r border-border p-1.5 last:border-r-0 hover:bg-surface-alt ${inMonth ? "" : "bg-surface-alt/60"} ${d === today ? "ring-2 ring-inset ring-primary/60" : ""}`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`text-[12px] font-bold ${inMonth ? "text-text" : "text-text-muted"}`}>{Number(d.slice(8))}</span>
                      {totalPax(list) > 0 && <span className="text-[10.5px] font-semibold text-text-muted">{`${totalPax(list)} pax`}</span>}
                    </div>
                    <div className="flex flex-col gap-1">
                      {list.slice(0, 3).map((e) => (
                        <Chip key={e.key} e={e} eventHref={eventHref} plain />
                      ))}
                      {list.length > 3 && <span className="text-[11px] font-semibold text-primary">{`+${list.length - 3} more`}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "week") {
    const first = startOfWeek(date);
    const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((d, i) => {
          const list = byDate.get(d) ?? [];
          return (
            <div key={d} className={`rounded-xl border bg-surface p-2.5 shadow-sm ${d === today ? "border-primary" : "border-border"}`}>
              <div className="mb-2 flex items-center justify-between">
                <Link href={href("day", d)} className="text-[12.5px] font-extrabold text-text hover:underline">{`${WEEKDAYS[i]} ${Number(d.slice(8))}`}</Link>
                {totalPax(list) > 0 && <span className="text-[11px] font-semibold text-text-muted">{`${totalPax(list)} pax`}</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                {list.length === 0 ? <span className="text-[12px] text-text-muted">—</span> : list.map((e) => <Chip key={e.key} e={e} eventHref={eventHref} />)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (view === "day") {
    const list = byDate.get(date) ?? [];
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[13px] text-text-secondary">
          {`${list.filter((e) => e.phase !== "cancelled").length} event(s) · ${totalPax(list)} pax in total`}
        </div>
        {list.length === 0 ? <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-[14px] text-text-muted">No events on this day.</div> : list.map((e) => <EntryCard key={e.key} e={e} eventHref={eventHref} canDelete={adminCompanyIds.includes(e.companyId)} query={query} />)}
      </div>
    );
  }

  // upcoming list
  const dates = Array.from(byDate.keys()).sort();
  return (
    <div className="flex flex-col gap-4">
      {dates.length === 0 && <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-[14px] text-text-muted">No upcoming events in the next 30 days.</div>}
      {dates.map((d) => (
        <section key={d}>
          <div className="mb-1.5 flex items-center justify-between">
            <Link href={href("day", d)} className="text-[13.5px] font-extrabold text-text hover:underline">
              {dateLabel(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {d === today ? " · Today" : ""}
            </Link>
            <span className="text-[12px] text-text-muted">{`${totalPax(byDate.get(d) ?? [])} pax`}</span>
          </div>
          <div className="flex flex-col gap-2">
            {(byDate.get(d) ?? []).map((e) => (
              <EntryCard key={e.key} e={e} eventHref={eventHref} canDelete={adminCompanyIds.includes(e.companyId)} query={query} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
