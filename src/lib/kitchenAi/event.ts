import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { MEAL_TYPE_LABEL } from "@/lib/catering/constants";
import { similarity } from "./match";
import type { EventContext } from "./types";

type DB = SupabaseClient<Database>;

/** The dishes written in an event order's menu text (one per line; a one-line menu is split at the commas). */
export function parseMenuText(text: string | null | undefined): string[] {
  if (!text) return [];
  let lines = text.split(/\r?\n|;|•/).map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  if (nonEmpty.length === 1 && nonEmpty[0].includes(",")) lines = nonEmpty[0].split(",").map((l) => l.trim());
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    // "1 x air kordial" -> "air kordial"; "- Nasi putih" -> "Nasi putih"; prices ("RM10") are not dishes
    const cleaned = l.replace(/^[-–*\d.)\s]*(?=[A-Za-z])/, "").replace(/^\d+\s*x\s+/i, "").replace(/\s+/g, " ").trim();
    if (!cleaned || /^rm\s*\d/i.test(cleaned) || cleaned.length > 100) continue;
    const key = cleaned.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

/** Words that only describe how the food is served (pack food, dome set, buffet ...): such a line is a service type, not a dish. */
const SERVICE_WORDS = new Set(["BUFFET", "PACK", "PACKED", "FOOD", "DOME", "DOMES", "SET", "VIP", "LIVE", "COOKING", "STATION", "COCKTAIL", "CANAPE", "PREPLATED", "PRE", "PLATED", "HIDANG", "SERVE", "SERVICE", "BOX", "LINE"]);
export function isServiceTypeLine(line: string): boolean {
  const words = line.toUpperCase().replace(/[^A-Z0-9]+/g, " ").split(" ").filter(Boolean).filter((w) => !/^\d+$/.test(w));
  return words.length > 0 && words.every((w) => SERVICE_WORDS.has(w)) && words.some((w) => w !== "SET" && w !== "FOOD" && w !== "LINE" && w !== "VIP" && w !== "SERVICE");
}

/** The lines of a menu text split into the dishes and the service types written among them. */
export function splitMenu(lines: string[]): { dishes: string[]; serviceTypes: string[] } {
  return { dishes: lines.filter((l) => !isServiceTypeLine(l)), serviceTypes: lines.filter((l) => isServiceTypeLine(l)) };
}

const mealLabels = (types: string[] | null | undefined) => (types ?? []).map((t) => MEAL_TYPE_LABEL[t] ?? t).join(" + ");

export type EventDraft = { ctx: EventContext; companyId: string; sessions: { name: string; pax: number | null; menu: string[]; serviceTypes: string[] }[] };

/** The event order as the kitchen needs it: confirmed pax per session, the menu, and the preparation times. Nothing is written back. */
export async function loadEventDraft(supabase: DB, eventId: string): Promise<EventDraft | null> {
  const { data: ev } = await supabase
    .from("catering_events")
    .select("id, company_id, event_name, event_date, status, event_time, setup_time, meal_types, service_pax, second_service_type, second_service_pax, pax_count, menu_description, package_menu_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return null;

  const [{ data: days }, { data: pkgItems }] = await Promise.all([
    supabase.from("catering_event_days").select("*").eq("catering_event_id", eventId).order("sort_order").order("day_date"),
    ev.package_menu_id
      ? supabase.from("package_menu_items").select("item_name, meal_type, sort_order").eq("package_menu_id", ev.package_menu_id).order("sort_order")
      : Promise.resolve({ data: [] as { item_name: string; meal_type: string; sort_order: number }[] }),
  ]);

  const sessions: EventDraft["sessions"] = [];
  if ((days ?? []).length > 0) {
    (days ?? []).forEach((d, i) => {
      const pax = (d.service_pax ?? 0) + (d.second_service_type ? d.second_service_pax ?? 0 : 0);
      const label = mealLabels(d.meal_types);
      const split = splitMenu(parseMenuText(d.menu_details || ev.menu_description));
      sessions.push({ name: `Day ${i + 1}${label ? ` · ${label}` : ""}`, pax: pax > 0 ? pax : null, menu: split.dishes, serviceTypes: split.serviceTypes });
    });
  } else {
    const pax = (ev.service_pax ?? ev.pax_count ?? 0) + (ev.second_service_type ? ev.second_service_pax ?? 0 : 0);
    const fromPackage = (pkgItems ?? []).map((p) => p.item_name).filter(Boolean);
    const split = splitMenu([...parseMenuText(ev.menu_description), ...fromPackage]);
    sessions.push({ name: mealLabels(ev.meal_types) || "Menu", pax: pax > 0 ? pax : null, menu: split.dishes, serviceTypes: split.serviceTypes });
  }

  const ctx: EventContext = {
    id: ev.id,
    name: ev.event_name,
    date: ev.event_date,
    status: ev.status,
    eventTime: ev.event_time ? ev.event_time.slice(0, 5) : null,
    setupTime: ev.setup_time ? ev.setup_time.slice(0, 5) : null,
    sessions: sessions.filter((s) => s.pax !== null).map((s) => ({ name: s.name, pax: s.pax! })),
    menu: Array.from(new Set(sessions.flatMap((s) => s.menu))),
  };
  return { ctx, companyId: ev.company_id, sessions };
}

/** What differs between the menu read from a photo and the event order: dishes on one side only, and a different pax. */
export function compareWithEvent(photo: { name: string; pax: number | null; dishes: string[] }[], event: EventContext): { onlyInPhoto: string[]; onlyInOrder: string[]; paxDiffers: { session: string; photo: number; order: number }[] } {
  const photoDishes = photo.flatMap((s) => s.dishes);
  const same = (a: string, b: string) => similarity(a, b) >= 0.85;
  const onlyInPhoto = photoDishes.filter((d) => !event.menu.some((m) => same(d, m)));
  const onlyInOrder = event.menu.filter((m) => !photoDishes.some((d) => same(d, m)));
  const paxDiffers: { session: string; photo: number; order: number }[] = [];
  const photoTotal = photo.reduce((t, s) => t + (s.pax ?? 0), 0);
  const orderTotal = event.sessions.reduce((t, s) => t + s.pax, 0);
  if (photoTotal > 0 && orderTotal > 0 && photoTotal !== orderTotal) paxDiffers.push({ session: "", photo: photoTotal, order: orderTotal });
  return { onlyInPhoto, onlyInOrder, paxDiffers };
}
