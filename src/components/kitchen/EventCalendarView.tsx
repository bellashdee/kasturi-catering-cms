import Link from "next/link";
import { EVENT_STATUS_LABEL, MEAL_TYPE_LABEL } from "@/lib/catering/constants";
import { addDays, dateLabel, monthGrid, startOfWeek, type CalendarEntry, type CalendarView, type EventPhase } from "@/lib/catering/calendar";

const PHASE_STYLE: Record<EventPhase, string> = {
  confirmed: "border-l-[3px] border-success bg-success-bg text-text",
  tentative: "border-l-[3px] border-dashed border-warning bg-warning-bg/60 text-text",
  finished: "border-l-[3px] border-border-strong bg-surface-alt text-text-secondary",
  cancelled: "border-l-[3px] border-danger bg-danger-bg/60 text-text-muted line-through",
};

const PHASE_MARK: Record<EventPhase, string> = { confirmed: "●", tentative: "◌", finished: "✓", cancelled: "✕" };

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
};

function groupByDate(entries: CalendarEntry[]) {
  const map = new Map<string, CalendarEntry[]>();
  for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return map;
}

function totalPax(list: CalendarEntry[]) {
  return list.filter((e) => e.phase !== "cancelled").reduce((t, e) => t + e.pax, 0);
}

function Chip({ e, eventHref }: { e: CalendarEntry; eventHref: Props["eventHref"] }) {
  return (
    <Link
      href={eventHref(e.eventId)}
      title={`${e.eventName} · ${EVENT_STATUS_LABEL[e.status] ?? e.status} · ${e.pax} pax${e.venue ? ` · ${e.venue}` : ""}`}
      className={`block truncate rounded px-1.5 py-1 text-[11.5px] font-semibold leading-tight hover:opacity-80 ${PHASE_STYLE[e.phase]}`}
    >
      <span aria-hidden="true">{PHASE_MARK[e.phase]} </span>
      {e.eventTime ? `${e.eventTime} ` : ""}
      {e.eventName}
      {e.pax > 0 ? ` · ${e.pax}` : ""}
      {e.alert ? " ⚠" : ""}
    </Link>
  );
}

function EntryCard({ e, eventHref }: { e: CalendarEntry; eventHref: Props["eventHref"] }) {
  return (
    <Link href={eventHref(e.eventId)} className={`block rounded-xl px-4 py-3 shadow-sm hover:opacity-90 ${PHASE_STYLE[e.phase]} ${e.phase === "cancelled" ? "" : "border border-border"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-extrabold">{e.eventName}</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11.5px] font-bold text-text-secondary">{EVENT_STATUS_LABEL[e.status] ?? e.status}</span>
        {e.dayNumber && e.dayCount > 1 && <span className="text-[12px] text-text-muted">{`Day ${e.dayNumber} of ${e.dayCount}`}</span>}
        <span className="ml-auto text-[12px] text-text-muted">{e.companyName}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-text-secondary sm:grid-cols-4">
        <span>{`Pax: ${e.pax > 0 ? e.pax : "—"}`}</span>
        <span>{`Food ready: ${e.eventTime || "—"}`}</span>
        <span>{`Set-up (kitchen): ${e.setupTime || "—"}`}</span>
        <span>{`Kitchen PIC: ${e.pic || "—"}`}</span>
      </div>
      {e.venue && <div className="mt-1 text-[12.5px] text-text-secondary">{`Venue: ${e.venue}`}</div>}
      {e.mealTypes.length > 0 && <div className="mt-1 text-[12.5px] text-text-secondary">{`Meals: ${e.mealTypes.map((m) => MEAL_TYPE_LABEL[m] ?? m).join(", ")}`}</div>}
      {e.menu && <div className="mt-1 line-clamp-2 whitespace-pre-line text-[12.5px] text-text">{e.menu}</div>}
      {e.alert && <div className="mt-1.5 text-[12.5px] font-bold text-danger">{`⚠ ${e.alert}`}</div>}
    </Link>
  );
}

export function EventCalendarView({ view, date, today, entries, href, eventHref }: Props) {
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
                  <div key={d} className={`min-h-[104px] border-r border-border p-1.5 last:border-r-0 ${inMonth ? "" : "bg-surface-alt/60"} ${d === today ? "ring-2 ring-inset ring-primary/60" : ""}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <Link href={href("day", d)} className={`text-[12px] font-bold hover:underline ${inMonth ? "text-text" : "text-text-muted"}`}>
                        {Number(d.slice(8))}
                      </Link>
                      {totalPax(list) > 0 && <span className="text-[10.5px] font-semibold text-text-muted">{`${totalPax(list)} pax`}</span>}
                    </div>
                    <div className="flex flex-col gap-1">
                      {list.slice(0, 3).map((e) => (
                        <Chip key={e.key} e={e} eventHref={eventHref} />
                      ))}
                      {list.length > 3 && (
                        <Link href={href("day", d)} className="text-[11px] font-semibold text-primary hover:underline">
                          {`+${list.length - 3} more`}
                        </Link>
                      )}
                    </div>
                  </div>
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
        {list.length === 0 ? <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-[14px] text-text-muted">No events on this day.</div> : list.map((e) => <EntryCard key={e.key} e={e} eventHref={eventHref} />)}
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
              <EntryCard key={e.key} e={e} eventHref={eventHref} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
