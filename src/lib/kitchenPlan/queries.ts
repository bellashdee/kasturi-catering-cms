import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { dayPax } from "@/lib/catering/days";
import { parseMenuText, splitMenu } from "@/lib/kitchenAi/event";
import { scaleIngredientRequirements, type IngredientRequirement } from "@/lib/kitchen/queries";

type DB = SupabaseClient<Database>;

/** One event (or one day of a multi-day event) the kitchen can make a cooking plan for. Everything comes from the Event Order. */
export type PlanEvent = {
  eventId: string;
  dayId: string | null;
  companyId: string;
  companyName: string;
  eventName: string;
  /** yyyy-mm-dd */
  date: string;
  /** hh:mm, when the food must be ready; null when the Event Order has no time */
  readyTime: string | null;
  pax: number;
  /** the dishes written in the Event Order's menu */
  dishes: string[];
  dayNumber: number | null;
  dayCount: number;
};

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

const EVENT_SELECT =
  "id, company_id, event_name, event_date, event_time, pax_count, service_pax, second_service_type, second_service_pax, menu_description, companies(name), catering_event_days(id, day_date, event_time, service_pax, second_service_type, second_service_pax, menu_details)";

type EventRow = {
  id: string;
  company_id: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
  pax_count: number | null;
  menu_description: string | null;
  companies: { name: string } | null;
  catering_event_days: { id: string; day_date: string; event_time: string | null; service_pax: number; second_service_type: string | null; second_service_pax: number | null; menu_details: string | null }[] | null;
};

function toPlanEvents(ev: EventRow): PlanEvent[] {
  const days = [...(ev.catering_event_days ?? [])].sort((a, b) => a.day_date.localeCompare(b.day_date));
  const base = { eventId: ev.id, companyId: ev.company_id, companyName: ev.companies?.name ?? "", eventName: ev.event_name };
  if (days.length === 0) {
    return [{ ...base, dayId: null, date: ev.event_date, readyTime: hhmm(ev.event_time), pax: ev.pax_count ?? 0, dishes: splitMenu(parseMenuText(ev.menu_description)).dishes, dayNumber: null, dayCount: 1 }];
  }
  return days.map((d, i) => ({
    ...base,
    dayId: d.id,
    date: d.day_date,
    readyTime: hhmm(d.event_time) ?? hhmm(ev.event_time),
    pax: dayPax({ servicePax: d.service_pax, secondServiceType: d.second_service_type ?? undefined, secondServicePax: d.second_service_pax ?? undefined }),
    dishes: splitMenu(parseMenuText(d.menu_details || ev.menu_description)).dishes,
    dayNumber: days.length > 1 ? i + 1 : null,
    dayCount: days.length,
  }));
}

/** Confirmed events from yesterday onward, plus any event that already has a plan (so an older plan can still be opened), a row for every day, soonest first. */
export async function listPlanEvents(supabase: DB, companyIds: string[]): Promise<PlanEvent[]> {
  const from = new Date(Date.now() + 8 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
  const [upcoming, planned] = await Promise.all([
    supabase.from("catering_events").select(EVENT_SELECT).in("company_id", companyIds).in("status", ["confirmed", "in_production"]).gte("event_date", from).order("event_date").limit(100),
    supabase.from("kitchen_plan_tasks").select("catering_event_id").in("company_id", companyIds).limit(1000),
  ]);
  if (upcoming.error) throw upcoming.error;
  const have = new Set((upcoming.data ?? []).map((e) => e.id));
  const extraIds = Array.from(new Set((planned.data ?? []).map((t) => t.catering_event_id))).filter((id) => !have.has(id));
  let extra: unknown[] = [];
  if (extraIds.length > 0) {
    const { data, error } = await supabase.from("catering_events").select(EVENT_SELECT).in("id", extraIds);
    if (error) throw error;
    extra = data ?? [];
  }
  return ([...(upcoming.data ?? []), ...extra] as unknown as EventRow[])
    .flatMap(toPlanEvents)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.readyTime ?? "").localeCompare(b.readyTime ?? ""));
}

export async function getPlanEvent(supabase: DB, eventId: string, dayId: string | null): Promise<PlanEvent | null> {
  const { data, error } = await supabase.from("catering_events").select(EVENT_SELECT).eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const all = toPlanEvents(data as unknown as EventRow);
  return all.find((e) => e.dayId === dayId) ?? (dayId === null ? all[0] ?? null : null);
}

export type PlanTask = Database["public"]["Tables"]["kitchen_plan_tasks"]["Row"];

export async function listPlanTasks(supabase: DB, eventId: string, dayId: string | null): Promise<PlanTask[]> {
  let q = supabase.from("kitchen_plan_tasks").select("*").eq("catering_event_id", eventId);
  q = dayId ? q.eq("catering_event_day_id", dayId) : q.is("catering_event_day_id", null);
  const { data, error } = await q.order("start_at").order("sort_order");
  if (error) throw error;
  return data ?? [];
}

/** How far each event's plan is: completed dishes of all dishes, for the event list. */
export async function planProgress(supabase: DB, eventIds: string[]): Promise<Map<string, { done: number; total: number }>> {
  const map = new Map<string, { done: number; total: number }>();
  if (eventIds.length === 0) return map;
  const { data, error } = await supabase.from("kitchen_plan_tasks").select("catering_event_id, catering_event_day_id, status").in("catering_event_id", eventIds);
  if (error) throw error;
  for (const t of data ?? []) {
    const key = `${t.catering_event_id}:${t.catering_event_day_id ?? ""}`;
    const cur = map.get(key) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (t.status === "completed") cur.done += 1;
    map.set(key, cur);
  }
  return map;
}

export const planKey = (eventId: string, dayId: string | null) => `${eventId}:${dayId ?? ""}`;

/** What the kitchen has saved for a dish: the written steps and the ingredients scaled to the pax. Nothing is made up. */
export type DishGuide = { steps: string[]; ingredients: IngredientRequirement[]; recipeName: string; yieldPax: number };

export async function loadDishGuides(supabase: DB, tasks: { recipe_id: string | null; pax: number }[]): Promise<Map<string, DishGuide>> {
  const ids = Array.from(new Set(tasks.map((t) => t.recipe_id).filter((x): x is string => !!x)));
  const guides = new Map<string, DishGuide>();
  if (ids.length === 0) return guides;
  const { data, error } = await supabase
    .from("recipes")
    .select("id, name, yield_pax, instructions, recipe_ingredients(ingredient_id, quantity_per_yield, unit, ingredients(name, unit_of_measure, current_stock_qty, unit_cost))")
    .in("id", ids);
  if (error) throw error;
  for (const r of data ?? []) {
    const steps = (r.instructions ?? "")
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:step\s*)?\d+\s*[.):-]\s*/i, "").replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
    // a recipe is scaled to the pax of each task that uses it, so the guide stores the base (per yield) and the task rescales
    guides.set(r.id, { steps, recipeName: r.name, yieldPax: Number(r.yield_pax), ingredients: scaleIngredientRequirements(r.recipe_ingredients, Number(r.yield_pax), Number(r.yield_pax)) });
  }
  return guides;
}

/** The ingredient list of a dish for `pax` guests, from its recipe's base list (null when there is no recipe or no ingredients). */
export function ingredientsForPax(guide: DishGuide | undefined, pax: number): IngredientRequirement[] | null {
  if (!guide || guide.ingredients.length === 0 || guide.yieldPax <= 0) return null;
  const f = pax / guide.yieldPax;
  return guide.ingredients.map((i) => ({ ...i, quantityNeeded: Math.round(i.quantityNeeded * f * 1000) / 1000 }));
}
