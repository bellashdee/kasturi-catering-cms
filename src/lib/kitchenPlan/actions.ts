"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";
import { autoMatch } from "@/lib/kitchenAi/match";
import { loadRecipeRefs } from "@/lib/kitchenAi/data";
import { buildSchedule, estimateMinutes, myMoment } from "./schedule";
import { getPlanEvent, listPlanTasks } from "./queries";

async function requireUser() {
  const session = await getSessionContext();
  if (!session) throw new Error("Please sign in again.");
  return { session, supabase: await createClient() };
}

/** The Kitchen PIC, managers and admins. A kitchen staff member (role "staff") only follows the plan. */
const canManage = (role: string) => role !== "staff";

const revalidate = (eventId: string) => {
  revalidatePath("/kitchen/plan");
  revalidatePath(`/kitchen/plan/${eventId}`);
};

export type GenerateInput = {
  eventId: string;
  dayId: string | null;
  dishes: string[];
  cooks: number;
  /** hh:mm, used only when the Event Order has no time */
  readyTime?: string;
};

/** Step 3: turn the menu into a plan (saved for the event day). A plan that already exists can only be replaced by the Kitchen PIC. */
export async function generateCookingPlan(input: GenerateInput): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const { session, supabase } = await requireUser();
    const event = await getPlanEvent(supabase, input.eventId, input.dayId);
    if (!event) throw new Error("This event was not found, or you do not have access to it.");
    if (!session.hasAllCompaniesAccess && !session.companyIds.includes(event.companyId)) throw new Error("You do not have access to this event.");

    const names: string[] = [];
    const seen = new Set<string>();
    for (const raw of input.dishes) {
      const n = raw.replace(/\s+/g, " ").trim().slice(0, 120);
      if (n && !seen.has(n.toUpperCase())) {
        seen.add(n.toUpperCase());
        names.push(n);
      }
    }
    if (names.length === 0) throw new Error("Add at least one dish first.");
    if (names.length > 40) throw new Error("A plan can have up to 40 dishes.");
    if (!event.pax || event.pax < 1) throw new Error("This event has no number of pax. Ask the office to fill in the Event Order.");
    const cooks = Math.round(input.cooks);
    if (!(cooks >= 1 && cooks <= 20)) throw new Error("Enter how many cooks will work (1 to 20).");
    const ready = event.readyTime ?? input.readyTime ?? null;
    if (!ready || !/^\d{2}:\d{2}$/.test(ready)) throw new Error("Enter the time the food must be ready.");

    const existing = await listPlanTasks(supabase, event.eventId, event.dayId);
    if (existing.length > 0 && !canManage(session.role)) throw new Error("A plan already exists for this event. Ask the Kitchen PIC to change it.");

    const recipes = await loadRecipeRefs(supabase, event.companyId);
    const dishes = names.map((name) => ({ name, minutes: estimateMinutes(name), recipeId: autoMatch(name, recipes)?.recipeId ?? null }));
    const schedule = buildSchedule(dishes.map((d) => ({ name: d.name, minutes: d.minutes })), cooks, myMoment(event.date, ready));

    if (existing.length > 0) {
      let del = supabase.from("kitchen_plan_tasks").delete().eq("catering_event_id", event.eventId);
      del = event.dayId ? del.eq("catering_event_day_id", event.dayId) : del.is("catering_event_day_id", null);
      const { error } = await del;
      if (error) throw error;
    }
    const rows = schedule.map((t, i) => ({
      company_id: event.companyId,
      catering_event_id: event.eventId,
      catering_event_day_id: event.dayId,
      sort_order: i,
      dish_name: t.name,
      recipe_id: dishes.find((d) => d.name === t.name)?.recipeId ?? null,
      pax: event.pax,
      duration_minutes: t.minutes,
      duration_is_estimate: true,
      start_at: new Date(t.startMs).toISOString(),
      end_at: new Date(t.endMs).toISOString(),
      assigned_to: `Chef ${t.cook + 1}`,
      created_by: session.userId,
    }));
    const { error } = await supabase.from("kitchen_plan_tasks").insert(rows);
    if (error) throw error;
    await recordAudit({ companyId: event.companyId, relatedTable: "kitchen_plan_tasks", relatedId: event.eventId, action: "cooking_plan_created", newValue: `${event.eventName} · ${rows.length} dishes · ${cooks} cooks` });
    revalidate(event.eventId);
    return { count: rows.length };
  });
}

/** Start / finish a dish. Anyone with access to the kitchen can do this. */
export async function setPlanTaskStatus(taskId: string, status: "not_started" | "in_progress" | "completed"): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!["not_started", "in_progress", "completed"].includes(status)) throw new Error("Unknown status.");
    const now = new Date().toISOString();
    const patch =
      status === "in_progress" ? { status, started_at: now, completed_at: null } : status === "completed" ? { status, completed_at: now } : { status, started_at: null, completed_at: null };
    const { data, error } = await supabase.from("kitchen_plan_tasks").update(patch).eq("id", taskId).select("id, catering_event_id");
    if (error) throw error;
    if (!data?.length) throw new Error("You cannot change this task.");
    revalidate(data[0].catering_event_id);
    return {};
  });
}

export type TaskEdit = { taskId: string; minutes: number; assignedTo: string; startHhmm?: string };

/** Kitchen PIC / admin: change how long a dish takes (confirming the estimate), who cooks it, and when it starts. The end follows the length. */
export async function updatePlanTask(input: TaskEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { session, supabase } = await requireUser();
    if (!canManage(session.role)) throw new Error("Only the Kitchen PIC or an admin can change the plan.");
    const minutes = Math.round(input.minutes);
    if (!(minutes >= 5 && minutes <= 1440)) throw new Error("The time a dish takes must be between 5 and 1440 minutes.");
    const { data: task, error: readError } = await supabase.from("kitchen_plan_tasks").select("id, catering_event_id, start_at").eq("id", input.taskId).single();
    if (readError) throw readError;
    let startMs = new Date(task.start_at).getTime();
    if (input.startHhmm) {
      if (!/^\d{2}:\d{2}$/.test(input.startHhmm)) throw new Error("Enter the start time as hours and minutes.");
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(task.start_at));
      startMs = myMoment(date, input.startHhmm);
    }
    const { error } = await supabase
      .from("kitchen_plan_tasks")
      .update({ duration_minutes: minutes, duration_is_estimate: false, assigned_to: input.assignedTo.trim().slice(0, 40) || null, start_at: new Date(startMs).toISOString(), end_at: new Date(startMs + minutes * 60_000).toISOString() })
      .eq("id", input.taskId);
    if (error) throw error;
    revalidate(task.catering_event_id);
    return {};
  });
}

/** Kitchen PIC / admin: remove the whole plan of an event day so it can be made again. */
export async function deleteCookingPlan(eventId: string, dayId: string | null): Promise<ActionResult> {
  return runAction(async () => {
    const { session, supabase } = await requireUser();
    if (!canManage(session.role)) throw new Error("Only the Kitchen PIC or an admin can remove the plan.");
    let del = supabase.from("kitchen_plan_tasks").delete().eq("catering_event_id", eventId);
    del = dayId ? del.eq("catering_event_day_id", dayId) : del.is("catering_event_day_id", null);
    const { error } = await del;
    if (error) throw error;
    revalidate(eventId);
    return {};
  });
}
