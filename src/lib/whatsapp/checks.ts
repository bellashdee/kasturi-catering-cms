import { sessionPax, type WaDate, type WaResult } from "@/lib/whatsapp/types";

export type CheckLevel = "ok" | "missing" | "verify";
export type CheckItem = { level: CheckLevel; label: string; detail?: string };

const WEEKDAYS: Record<string, number> = {
  // Malay
  ahad: 0, isnin: 1, selasa: 2, rabu: 3, khamis: 4, jumaat: 5, "jumu'at": 5, jumat: 5, sabtu: 6,
  // English
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const DAY_NAME_MS = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];

/** The weekday of a YYYY-MM-DD date (0 = Sunday), counted in UTC so no timezone moves the day. */
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export const malayDay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? DAY_NAME_MS[weekdayOf(iso)] : "");

/** null = no weekday written / not recognised; true / false = it matches the date or not. */
export function weekdayMatches(d: WaDate): boolean | null {
  if (!d.weekdayStated || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return null;
  const key = d.weekdayStated.trim().toLowerCase().replace(/[().,]/g, "");
  const n = WEEKDAYS[key];
  if (n === undefined) return null;
  return n === weekdayOf(d.date);
}

function dateChecks(d: WaDate, label: string): CheckItem[] {
  if (!d.date) return [{ level: "missing", label: `${label}: date`, detail: "Not provided" }];
  const out: CheckItem[] = [];
  if (!d.yearStated) out.push({ level: "verify", label: `${label}: year`, detail: `The year is not in the message; ${d.date.slice(0, 4)} was filled in. Check it.` });
  const wd = weekdayMatches(d);
  if (wd === false) out.push({ level: "verify", label: `${label}: day and date do not match`, detail: `The message says "${d.weekdayStated}" but ${d.date} is a ${malayDay(d.date)}. The date was not changed.` });
  if (out.length === 0) out.push({ level: "ok", label: `${label}: date`, detail: d.date });
  return out;
}

/** The checklist shown under the form: what is complete, what is missing (Pending / Not Provided) and what the Admin must check. */
export function checkResult(r: WaResult): CheckItem[] {
  const out: CheckItem[] = [];
  if (r.category === "quotation") {
    const q = r.quotation;
    out.push(q.eventName.trim() ? { level: "ok", label: "Event name" } : { level: "missing", label: "Event name", detail: "Pending" });
    out.push(q.venue.trim() ? { level: "ok", label: "Venue" } : { level: "missing", label: "Venue", detail: "Not Provided" });
    out.push(q.budget.trim() ? { level: "ok", label: "Budget" } : { level: "missing", label: "Budget", detail: "Not Provided" });
    if (q.days.length === 0) out.push({ level: "missing", label: "Event date", detail: "Not provided" });
    q.days.forEach((d, i) => {
      const dl = q.days.length > 1 ? `Day ${i + 1}` : "Event";
      out.push(...dateChecks(d, dl));
      d.sessions.forEach((s, n) => {
        const sl = `${dl} · ${s.name.trim() || `Meal session ${n + 1}`}`;
        out.push(s.menu.trim() ? { level: "ok", label: `${sl}: menu` } : { level: "missing", label: `${sl}: menu`, detail: "Pending" });
        out.push(sessionPax(s) ? { level: "ok", label: `${sl}: pax`, detail: String(sessionPax(s)) } : { level: "missing", label: `${sl}: pax`, detail: "Pending" });
        const missingQty = s.breakdown.filter((l) => !(typeof l.pax === "number" && l.pax > 0)).map((l) => l.category || "(no name)");
        if (missingQty.length > 0) out.push({ level: "missing", label: `${sl}: pax of ${missingQty.join(", ")}`, detail: "Pending" });
        if (s.paxStated && s.breakdown.length > 0 && sessionPax(s) !== s.paxStated)
          out.push({ level: "verify", label: `${sl}: pax total`, detail: `The breakdown adds up to ${sessionPax(s)}, the message says ${s.paxStated}.` });
        if (!s.mealTime && !s.deliveryTime) out.push({ level: "missing", label: `${sl}: meal / delivery time`, detail: "Not Provided" });
        if (s.mealTypes.length === 0) out.push({ level: "missing", label: `${sl}: meal type`, detail: "Pending" });
      });
    });
  } else if (r.category === "jdt_match") {
    if (r.matches.length === 0) out.push({ level: "missing", label: "Match dates", detail: "No match found in the message" });
    r.matches.forEach((m, i) => {
      const ml = `Match ${i + 1}${m.matchDetails ? ` (${m.matchDetails})` : ""}`;
      out.push(...dateChecks(m, ml));
      if (!m.venue.trim()) out.push({ level: "missing", label: `${ml}: venue`, detail: "Not Provided" });
      if (!m.kickOff) out.push({ level: "missing", label: `${ml}: kick-off time`, detail: "Not Provided" });
    });
  } else {
    const s = r.snack;
    out.push(...dateChecks(s, "Training"));
    if (s.items.length === 0) out.push({ level: "missing", label: "Items", detail: "No item found" });
    const noQty = s.items.filter((i) => !(typeof i.quantity === "number" && i.quantity > 0)).map((i) => i.name || "(no name)");
    if (noQty.length > 0) out.push({ level: "missing", label: `Quantity of ${noQty.join(", ")}`, detail: "Pending" });
    const noUnit = s.items.filter((i) => typeof i.quantity === "number" && i.quantity > 0 && !i.unit).map((i) => i.name);
    if (noUnit.length > 0) out.push({ level: "missing", label: `Unit of ${noUnit.join(", ")}`, detail: "Pending" });
    if (s.items.length > 0 && noQty.length === 0) out.push({ level: "ok", label: "Item quantities" });
  }
  for (const u of r.uncertain) if (u.trim()) out.push({ level: "verify", label: "AI was not sure", detail: u });
  return out;
}

/** How complete the information is: the share of checks that are OK (0–100). */
export function completion(items: CheckItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.level === "ok").length / items.length) * 100);
}
