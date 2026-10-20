import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { dobFromIc } from "@/lib/hr/ic";
import { shortNameOf } from "@/lib/hr/shortName";

type DB = SupabaseClient<Database>;

export type BirthdayRow = {
  full_name: string;
  short_name: string | null;
  date_of_birth: string | null;
  ic_passport_no: string | null;
  email: string | null;
  user_id: string | null;
  company_name: string;
};

export type Birthday = {
  name: string;
  shortName: string;
  companies: string[];
  /** Month and day as "MM-DD" (the year of birth is never shown). */
  monthDay: string;
  /** 0 = today. */
  daysAway: number;
  /** The signed-in person (their staff record is linked to their login, or has their e-mail address). */
  isMe: boolean;
};

const nameKey = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

function isLeap(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The next time the birthday falls on or after `today` (YYYY-MM-DD); someone born on 29 February celebrates on 28 February in other years. */
function nextOccurrence(monthDay: string, today: string): { iso: string; daysAway: number } {
  const [month, day] = monthDay.split("-").map(Number);
  const year = Number(today.slice(0, 4));
  const on = (y: number) => {
    const d = month === 2 && day === 29 && !isLeap(y) ? 28 : day;
    return `${y}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  let iso = on(year);
  if (iso < today) iso = on(year + 1);
  const daysAway = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return { iso, daysAway };
}

/**
 * Birthdays today and in the next days, from the staff records: the date of birth written on the record, or the one in a Malaysian
 * IC number. One person working in several companies is listed once. Only active staff are included.
 */
export function upcomingBirthdays(rows: BirthdayRow[], today: string, withinDays: number, me: { userId: string; email: string }): Birthday[] {
  const people = new Map<string, Birthday>();
  for (const r of rows) {
    const dob = r.date_of_birth ?? dobFromIc(r.ic_passport_no);
    if (!dob) continue;
    const monthDay = dob.slice(5);
    const { daysAway } = nextOccurrence(monthDay, today);
    if (daysAway > withinDays) continue;
    const key = nameKey(r.full_name);
    const mine = r.user_id === me.userId || (!!r.email && !!me.email && r.email.toLowerCase() === me.email.toLowerCase());
    const existing = people.get(key);
    if (existing) {
      if (!existing.companies.includes(r.company_name)) existing.companies.push(r.company_name);
      existing.isMe ||= mine;
    } else {
      people.set(key, { name: r.full_name.trim(), shortName: shortNameOf(r.full_name, r.short_name), companies: [r.company_name], monthDay, daysAway, isMe: mine });
    }
  }
  return Array.from(people.values()).sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));
}

export async function loadBirthdayRows(supabase: DB, companyIds: string[]): Promise<BirthdayRow[]> {
  if (companyIds.length === 0) return [];
  const { data, error } = await supabase
    .from("employees")
    .select("full_name, short_name, date_of_birth, ic_passport_no, email, user_id, companies(name)")
    .in("company_id", companyIds)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []).map((e) => ({ full_name: e.full_name, short_name: e.short_name, date_of_birth: e.date_of_birth, ic_passport_no: e.ic_passport_no, email: e.email, user_id: e.user_id, company_name: e.companies?.name ?? "" }));
}

export type CalendarBirthday = { day: number; name: string; shortName: string; companies: string[] };

/**
 * Every active staff member with a known birthday, placed in the months of the given year (index 0 = January). Someone born on
 * 29 February is shown on 28 February in a year without one. Staff without a known date of birth are counted separately.
 */
export function birthdaysByMonth(rows: BirthdayRow[], year: number): { months: CalendarBirthday[][]; unknown: number } {
  const months: CalendarBirthday[][] = Array.from({ length: 12 }, () => []);
  const seen = new Map<string, CalendarBirthday & { m: number }>();
  const unknownNames = new Set<string>();
  for (const r of rows) {
    const key = nameKey(r.full_name);
    const dob = r.date_of_birth ?? dobFromIc(r.ic_passport_no);
    if (!dob) {
      unknownNames.add(key);
      continue;
    }
    const month = Number(dob.slice(5, 7));
    let day = Number(dob.slice(8, 10));
    if (month === 2 && day === 29 && !isLeap(year)) day = 28;
    const existing = seen.get(key);
    if (existing) {
      if (!existing.companies.includes(r.company_name)) existing.companies.push(r.company_name);
    } else {
      seen.set(key, { day, m: month, name: r.full_name.trim(), shortName: shortNameOf(r.full_name, r.short_name), companies: [r.company_name] });
    }
  }
  for (const k of seen.keys()) unknownNames.delete(k);
  for (const b of seen.values()) months[b.m - 1].push({ day: b.day, name: b.name, shortName: b.shortName, companies: b.companies });
  for (const m of months) m.sort((a, b) => a.day - b.day || a.shortName.localeCompare(b.shortName));
  return { months, unknown: unknownNames.size };
}
