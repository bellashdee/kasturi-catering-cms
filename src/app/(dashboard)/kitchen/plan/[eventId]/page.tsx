import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getServerLanguage } from "@/lib/i18n/server";
import { loadRecipeRefs } from "@/lib/kitchenAi/data";
import { getPlanEvent, ingredientsForPax, listPlanTasks, loadDishGuides } from "@/lib/kitchenPlan/queries";
import { clockText, dayText, myMoment } from "@/lib/kitchenPlan/schedule";
import { kitchenPlanText } from "@/lib/kitchenPlan/text";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { PlanBuilder } from "@/components/kitchenPlan/PlanBuilder";
import { PlanSteps } from "@/components/kitchenPlan/PlanSteps";
import { PlanView, type ViewTask } from "@/components/kitchenPlan/PlanView";

/** Steps 2-4 of one event day: the menu and the "Generate Cooking Plan" button, or - once a plan exists - the instructions to follow. */
export default async function CookingPlanEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ day?: string; company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const lang = (await getServerLanguage()) === "ms" ? "ms" : "en";
  const t = kitchenPlanText(lang);

  const { eventId } = await params;
  const { day, company } = await searchParams;
  const dayId = day ?? null;
  const supabase = await createClient();

  const event = await getPlanEvent(supabase, eventId, dayId);
  if (!event) notFound();
  const tasks = await listPlanTasks(supabase, eventId, dayId);
  const backHref = `/kitchen/plan${company ? `?company=${company}` : ""}`;

  let body: React.ReactNode;
  if (tasks.length === 0) {
    const recipes = await loadRecipeRefs(supabase, event.companyId);
    body = <PlanBuilder eventId={eventId} dayId={dayId} initialDishes={event.dishes} recipeNames={recipes.map((r) => r.name)} readyTime={event.readyTime} />;
  } else {
    const guides = await loadDishGuides(supabase, tasks);
    const view: ViewTask[] = tasks.map((x) => {
      const guide = x.recipe_id ? guides.get(x.recipe_id) : undefined;
      return {
        id: x.id,
        dish: x.dish_name,
        startAt: x.start_at,
        endAt: x.end_at,
        minutes: x.duration_minutes,
        estimate: x.duration_is_estimate,
        assignedTo: x.assigned_to ?? "—",
        status: x.status as ViewTask["status"],
        pax: x.pax,
        steps: guide?.steps ?? [],
        ingredients: ingredientsForPax(guide, x.pax)?.map((i) => ({ name: i.ingredientName, quantity: i.quantityNeeded, unit: i.unit })) ?? null,
      };
    });
    const lastEnd = tasks.reduce((m, x) => Math.max(m, new Date(x.end_at).getTime()), 0);
    const readyAt = event.readyTime ? new Date(myMoment(event.date, event.readyTime)).toISOString() : new Date(lastEnd).toISOString();
    body = <PlanView eventId={eventId} dayId={dayId} eventName={event.eventName} pax={event.pax} readyAt={readyAt} tasks={view} canManage={session.role !== "staff"} me={session.fullName.split(/\s+/)[0] ?? ""} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
        <PlanSteps current={tasks.length === 0 ? 2 : 4} lang={lang} />
      </div>
      <KitchenSubNav />

      <div>
        <Link href={backHref} className="text-[13.5px] font-semibold text-text-secondary hover:underline">
          ← {t.back}
        </Link>
        {tasks.length === 0 && (
          <div className="mt-2">
            <div className="text-[20px] font-extrabold text-text">{event.eventName}</div>
            <div className="text-[14px] text-text-secondary">
              {dayText(myMoment(event.date, "12:00"))} · {event.pax || "—"} {t.pax} · {t.foodReady}: <b className="text-text">{event.readyTime ? clockText(myMoment(event.date, event.readyTime)) : t.noTime}</b>
            </div>
          </div>
        )}
      </div>

      {body}
    </div>
  );
}
