import { createAdminClient } from "@/lib/supabase/admin";
import { JDT_CUSTOMER_ID, JDT_EVENT_TYPE, SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";

export type JdtScheduleRow = {
  id: string;
  date: string;
  name: string;
  /** the match, e.g. "JDT FC vs KL CITY FC" */
  match: string;
  venue: string | null;
  /** "HH:MM" or "" */
  kickOff: string;
  status: string;
  menu: "Received" | "Pending" | "No catering";
  pax: number | "Pending" | "No catering";
  remarks: string | null;
  away: boolean;
};

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The JDT events of Signature Solution from today for the next `days` days (date-only ones included), for every department: only the
 * date, match, venue, kick-off and whether the menu and pax are in. No price or money is read. Read with the service client because
 * every staff member (kitchen, drivers, purchasing ...) must see the dates, whichever company they work for; the caller checks the sign-in.
 */
export async function loadUpcomingJdt(today: string, days = 60): Promise<JdtScheduleRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catering_events")
    .select("id, event_name, event_date, event_time, location, status, pax_count, menu_description, remarks, event_type, customer_id, catering_event_days(menu_details, service_pax)")
    .eq("company_id", SIGNATURE_COMPANY_ID)
    .or(`event_type.eq.${JDT_EVENT_TYPE},customer_id.eq.${JDT_CUSTOMER_ID}`)
    .gte("event_date", today)
    .lte("event_date", addDays(today, days))
    .order("event_date")
    .order("event_time", { nullsFirst: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((e) => {
    const away = /\bAWAY\b/i.test(e.event_name);
    const dayRows = (e.catering_event_days ?? []) as { menu_details: string | null; service_pax: number | null }[];
    const hasMenu = !!e.menu_description?.trim() || (dayRows.length > 0 && dayRows.every((d) => !!d.menu_details?.trim()));
    const pax = e.pax_count ?? 0;
    return {
      id: e.id,
      date: e.event_date,
      name: e.event_name,
      match: e.event_name
        .replace(/^JDT Match\s*[–-]\s*/i, "")
        .replace(/^AWAY:\s*/i, "")
        .replace(/\s*\(no catering\)$/i, "")
        .replace(/^JDT FC SDN BHD\s*/i, "")
        .replace(/^\((.*)\)$/, "$1"),
      venue: e.location,
      kickOff: e.event_time ? e.event_time.slice(0, 5) : "",
      status: e.status,
      menu: away ? "No catering" : hasMenu ? "Received" : "Pending",
      pax: away ? "No catering" : pax > 0 ? pax : "Pending",
      remarks: e.remarks,
      away,
    };
  });
}
