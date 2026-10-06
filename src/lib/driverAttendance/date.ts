/** Today's date (YYYY-MM-DD) in Malaysia time, so a morning clock-in is never filed under yesterday. */
export function todayInMalaysia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}
