import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { dayPax, type EventDay } from "@/lib/catering/days";

type DB = SupabaseClient<Database>;

export type CalendarView = "month" | "week" | "day" | "list";
export const CALENDAR_VIEWS: CalendarView[] = ["month", "week", "day", "list"];

/**
 * How an entry is shown: a quotation request from a sales agent that is not yet an event ("request"), a tentative booking
 * (enquiry / quoted), a confirmed event, a finished one, or a cancelled one.
 */
export type EventPhase = "request" | "tentative" | "confirmed" | "finished" | "cancelled";

export function phaseOf(status: string): EventPhase {
  if (status === "cancelled") return "cancelled";
  if (status === "confirmed" || status === "in_production") return "confirmed";
  if (status === "delivered" || status === "completed") return "finished";
  return "tentative";
}

export const PHASE_LABEL: Record<EventPhase, string> = {
  request: "Quotation request (not approved yet)",
  tentative: "Tentative (enquiry / quoted)",
  confirmed: "Confirmed",
  finished: "Delivered / completed",
  cancelled: "Cancelled",
};

export type CalendarEntry = {
  /** event id + day, so an event with several days is several entries */
  key: string;
  kind: "event" | "request";
  eventId: string;
  /** the quotation request, for an entry that is not an event yet */
  requestId: string | null;
  /** the catering_event_days row of this entry, when the event has separate days */
  dayId: string | null;
  companyId: string;
  eventName: string;
  status: string;
  phase: EventPhase;
  companyName: string;
  /** the customer who ordered the event ("" when it has none) */
  customerName: string;
  date: string;
  /** "HH:MM" or "" */
  eventTime: string;
  setupTime: string;
  venue: string | null;
  pic: string | null;
  pax: number;
  /** a day with a second service type has two pax numbers: its total cannot be edited in one box */
  twoServices: boolean;
  mealTypes: string[];
  menu: string | null;
  /** 1-based number of the day and the number of days of a multi-day event */
  dayNumber: number | null;
  dayCount: number;
  /** the latest quotation of the event (accepted before sent before draft) */
  quotation: { number: string; status: string } | null;
  /** An urgent preparation alert, when there is one. */
  alert: string | null;
};

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

// ---- dates (YYYY-MM-DD, all calculated in UTC so the device timezone never moves a day)
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The Monday of the week of a date. */
export function startOfWeek(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

/** The weeks shown by the month grid (Monday first): every date from the Monday before the 1st to the Sunday after the last day. */
export function monthGrid(iso: string): string[][] {
  const first = startOfWeek(monthStart(iso));
  const last = addDays(startOfWeek(monthEnd(iso)), 6);
  const weeks: string[][] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}

/** The first and last date a view needs. */
export function rangeOf(view: CalendarView, date: string): { start: string; end: string } {
  if (view === "month") {
    const grid = monthGrid(date);
    return { start: grid[0][0], end: grid[grid.length - 1][6] };
  }
  if (view === "week") return { start: startOfWeek(date), end: addDays(startOfWeek(date), 6) };
  if (view === "day") return { start: date, end: date };
  return { start: date, end: addDays(date, 30) };
}

export function dateLabel(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(`${iso}T00:00:00Z`));
}

const QUOTATION_RANK: Record<string, number> = { accepted: 4, sent: 3, draft: 2, rejected: 1 };

/**
 * The calendar entries of a date range. A multi-day event gives one entry per day (with that day's pax, meals and times);
 * an event without separate days gives one entry on its date. A quotation request from a sales agent that has not been
 * approved yet is shown too (as a request), so a new request is on the calendar as soon as it comes in. Nothing is invented:
 * a missing time or menu stays empty.
 */
export async function loadCalendarEntries(supabase: DB, companyIds: string[], start: string, end: string, today: string): Promise<CalendarEntry[]> {
  if (companyIds.length === 0) return [];
  const eventSelect = "id, event_name, status, location, pic_name, pax_count, event_date, event_time, setup_time, meal_types, menu_description, company_id, second_service_type, service_pax, companies(name), customers(name)";

  const [{ data: inRange, error: e1 }, { data: dayRows, error: e2 }, { data: requests, error: e3 }] = await Promise.all([
    supabase.from("catering_events").select(eventSelect).in("company_id", companyIds).gte("event_date", start).lte("event_date", end),
    supabase
      .from("catering_event_days")
      .select(`*, catering_events!inner(${eventSelect})`)
      .in("company_id", companyIds)
      .gte("day_date", start)
      .lte("day_date", end),
    supabase.from("quotation_requests").select("id, company_id, event_name, customer_name, location, pic_name, days, companies(name)").in("company_id", companyIds).eq("status", "pending"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  // events that have separate days (those days are the entries); the others are shown on their own date
  const candidateIds = (inRange ?? []).map((e) => e.id);
  const { data: allDays } = candidateIds.length
    ? await supabase.from("catering_event_days").select("catering_event_id").in("catering_event_id", candidateIds)
    : { data: [] as { catering_event_id: string }[] };
  const withDays = new Set((allDays ?? []).map((d) => d.catering_event_id));

  const entries: CalendarEntry[] = [];
  const countByEvent = new Map<string, number>();
  if ((dayRows ?? []).length > 0) {
    const ids = Array.from(new Set((dayRows ?? []).map((d) => d.catering_event_id)));
    const { data: counts } = await supabase.from("catering_event_days").select("catering_event_id, day_date").in("catering_event_id", ids).order("day_date");
    const order = new Map<string, string[]>();
    for (const c of counts ?? []) order.set(c.catering_event_id, [...(order.get(c.catering_event_id) ?? []), c.day_date]);
    for (const [id, dates] of order) countByEvent.set(id, dates.length);
    for (const d of dayRows ?? []) {
      const ev = d.catering_events;
      if (!ev) continue;
      const dates = order.get(d.catering_event_id) ?? [];
      entries.push({
        key: `${ev.id}:${d.day_date}`,
        kind: "event",
        eventId: ev.id,
        requestId: null,
        dayId: d.id,
        companyId: ev.company_id,
        eventName: ev.event_name,
        status: ev.status,
        phase: phaseOf(ev.status),
        companyName: ev.companies?.name ?? "",
        customerName: ev.customers?.name ?? "",
        date: d.day_date,
        eventTime: hhmm(d.event_time),
        setupTime: hhmm(d.setup_time),
        venue: ev.location,
        pic: ev.pic_name,
        pax: (d.service_pax ?? 0) + (d.second_service_type ? d.second_service_pax ?? 0 : 0),
        twoServices: !!d.second_service_type,
        mealTypes: d.meal_types ?? [],
        menu: d.menu_details || ev.menu_description,
        dayNumber: dates.indexOf(d.day_date) + 1 || null,
        dayCount: countByEvent.get(d.catering_event_id) ?? 1,
        quotation: null,
        alert: null,
      });
    }
  }
  for (const ev of inRange ?? []) {
    if (withDays.has(ev.id)) continue;
    entries.push({
      key: `${ev.id}:${ev.event_date}`,
      kind: "event",
      eventId: ev.id,
      requestId: null,
      dayId: null,
      companyId: ev.company_id,
      eventName: ev.event_name,
      status: ev.status,
      phase: phaseOf(ev.status),
      companyName: ev.companies?.name ?? "",
      customerName: ev.customers?.name ?? "",
      date: ev.event_date,
      eventTime: hhmm(ev.event_time),
      setupTime: hhmm(ev.setup_time),
      venue: ev.location,
      pic: ev.pic_name,
      pax: ev.pax_count ?? 0,
      twoServices: !!ev.second_service_type,
      mealTypes: ev.meal_types ?? [],
      menu: ev.menu_description,
      dayNumber: null,
      dayCount: 1,
      quotation: null,
      alert: null,
    });
  }

  // quotation requests that no one has approved yet: one entry per requested day
  for (const r of requests ?? []) {
    const days = (Array.isArray(r.days) ? r.days : []) as unknown as EventDay[];
    days.forEach((d, i) => {
      if (!d.dayDate || d.dayDate < start || d.dayDate > end) return;
      entries.push({
        key: `req:${r.id}:${d.dayDate}`,
        kind: "request",
        eventId: "",
        requestId: r.id,
        dayId: null,
        companyId: r.company_id,
        eventName: r.event_name,
        status: "request",
        phase: "request",
        companyName: r.companies?.name ?? "",
        customerName: r.customer_name ?? "",
        date: d.dayDate,
        eventTime: d.eventTime ?? "",
        setupTime: d.setupTime ?? "",
        venue: r.location,
        pic: r.pic_name,
        pax: dayPax(d),
        twoServices: !!d.secondServiceType,
        mealTypes: d.mealTypes ?? [],
        menu: d.menuDetails ?? null,
        dayNumber: days.length > 1 ? i + 1 : null,
        dayCount: days.length,
        quotation: null,
        alert: null,
      });
    });
  }

  // the quotation of each event
  const eventIds = Array.from(new Set(entries.filter((e) => e.kind === "event").map((e) => e.eventId)));
  if (eventIds.length > 0) {
    const { data: quotes } = await supabase.from("quotations").select("catering_event_id, quotation_number, status").in("catering_event_id", eventIds);
    const best = new Map<string, { number: string; status: string }>();
    for (const q of quotes ?? []) {
      const cur = best.get(q.catering_event_id);
      if (!cur || (QUOTATION_RANK[q.status] ?? 0) > (QUOTATION_RANK[cur.status] ?? 0)) best.set(q.catering_event_id, { number: q.quotation_number, status: q.status });
    }
    for (const e of entries) if (e.kind === "event") e.quotation = best.get(e.eventId) ?? null;
  }

  // urgent preparation alerts: a confirmed event in the next 3 days without a kitchen plan (production order) or without a time
  const soon = addDays(today, 3);
  const urgentIds = Array.from(new Set(entries.filter((e) => e.phase === "confirmed" && e.date >= today && e.date <= soon).map((e) => e.eventId)));
  const planned = new Set<string>();
  if (urgentIds.length > 0) {
    const { data: orders } = await supabase.from("production_orders").select("catering_event_id").in("catering_event_id", urgentIds);
    for (const o of orders ?? []) if (o.catering_event_id) planned.add(o.catering_event_id);
  }
  for (const e of entries) {
    if (e.phase !== "confirmed" || e.date < today || e.date > soon) continue;
    if (!planned.has(e.eventId)) e.alert = "No kitchen plan yet";
    else if (!e.eventTime) e.alert = "Food-ready time missing";
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.eventTime || "99:99").localeCompare(b.eventTime || "99:99") || a.eventName.localeCompare(b.eventName));
}
