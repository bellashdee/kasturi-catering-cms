/**
 * Yearly Annual Leave (AL) and Medical Leave (MC) entitlement and balance of a staff member.
 * The entitlement follows the Employment Act 1955 (Malaysia), by the completed years of service at the start of the year:
 *   AL: under 2 years 8 days, 2 to under 5 years 12 days, 5 years and more 16 days (the year the staff joined: in proportion to the months worked);
 *   MC: under 2 years 14 days, 2 to under 5 years 18 days, 5 years and more 22 days.
 * Taken = approved leave that starts in that year (plus the days HR keyed in as taken before the system); Waiting = leave still pending approval.
 * HR can also set the company's own entitlement for a year, which then replaces the Employment Act figure.
 */
export type LeaveYearBalance = {
  year: number;
  serviceYears: number;
  /** HR set this year by hand (entitlement and / or days taken before the system) */
  adjusted: boolean;
  takenBefore: { al: number; mc: number };
  al: { entitled: number; taken: number; waiting: number; balance: number };
  mc: { entitled: number; taken: number; waiting: number; balance: number };
};

type LeaveLike = { leave_type: string; start_date: string; days: number | string | null; status: string };

/** Set by hand by HR: the company's own entitlement (null = Employment Act) and the days taken before the system was used. */
export type LeaveAdjustment = { year: number; al_entitled: number | string | null; al_taken_before: number | string | null; mc_entitled: number | string | null; mc_taken_before: number | string | null; notes?: string | null };

function completedYears(joinDate: string, asOf: string): number {
  const [jy, jm, jd] = joinDate.split("-").map(Number);
  const [y, m, d] = asOf.split("-").map(Number);
  let years = y - jy;
  if (m < jm || (m === jm && d < jd)) years--;
  return Math.max(0, years);
}

export function alEntitlement(serviceYears: number): number {
  return serviceYears >= 5 ? 16 : serviceYears >= 2 ? 12 : 8;
}
export function mcEntitlement(serviceYears: number): number {
  return serviceYears >= 5 ? 22 : serviceYears >= 2 ? 18 : 14;
}

export function leaveBalanceForYear(joinDate: string | null, leave: LeaveLike[], year: number, adjustments: LeaveAdjustment[] = []): LeaveYearBalance {
  const adj = adjustments.find((a) => Number(a.year) === year);
  const service = joinDate ? completedYears(joinDate, `${year}-01-01`) : 0;
  let al = alEntitlement(service);
  if (joinDate && Number(joinDate.slice(0, 4)) === year) {
    // the year the staff joined: AL in proportion to the months left in the year (counting the month joined)
    const monthsWorked = 12 - Number(joinDate.slice(5, 7)) + 1;
    al = Math.round((al * monthsWorked) / 12);
  }
  let mc = mcEntitlement(service);
  if (adj && adj.al_entitled !== null && adj.al_entitled !== "") al = Number(adj.al_entitled);
  if (adj && adj.mc_entitled !== null && adj.mc_entitled !== "") mc = Number(adj.mc_entitled);
  const alBefore = Number(adj?.al_taken_before ?? 0);
  const mcBefore = Number(adj?.mc_taken_before ?? 0);
  const sum = (type: string, status: string[]) =>
    leave.filter((l) => l.leave_type === type && l.start_date.slice(0, 4) === String(year) && status.includes(l.status)).reduce((t, l) => t + Number(l.days ?? 0), 0);
  const alTaken = sum("annual", ["approved"]) + alBefore;
  const alWaiting = sum("annual", ["pending"]);
  const mcTaken = sum("medical", ["approved"]) + mcBefore;
  const mcWaiting = sum("medical", ["pending"]);
  return {
    year,
    serviceYears: service,
    adjusted: !!adj,
    takenBefore: { al: alBefore, mc: mcBefore },
    al: { entitled: al, taken: alTaken, waiting: alWaiting, balance: al - alTaken - alWaiting },
    mc: { entitled: mc, taken: mcTaken, waiting: mcWaiting, balance: mc - mcTaken - mcWaiting },
  };
}

/** This year and up to two years before (not before the year the staff joined), newest first. */
export function leaveBalanceYears(joinDate: string | null, leave: LeaveLike[], thisYear: number, adjustments: LeaveAdjustment[] = []): LeaveYearBalance[] {
  const first = Math.max(thisYear - 2, joinDate ? Number(joinDate.slice(0, 4)) : thisYear);
  const out: LeaveYearBalance[] = [];
  for (let y = thisYear; y >= first; y--) out.push(leaveBalanceForYear(joinDate, leave, y, adjustments));
  return out;
}
