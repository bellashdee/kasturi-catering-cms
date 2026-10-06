/** Today's date (YYYY-MM-DD) in Malaysia time, so a morning clock-in is never filed under yesterday. */
export function todayInMalaysia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

/** The current year and month (1-12) in Malaysia time. */
export function malaysiaMonthNow(): { year: number; month: number } {
  const [year, month] = todayInMalaysia().split("-").map(Number);
  return { year, month };
}
