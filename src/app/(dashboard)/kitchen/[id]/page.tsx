import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getProductionOrder, getRecipe, orderMenuItems } from "@/lib/kitchen/queries";
import { getMenuPlanDishWithIngredients } from "@/lib/menuPlan/queries";import { PRODUCTION_STATUS_LABEL } from "@/lib/kitchen/constants";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { ProductionOrderStatusSelect } from "@/components/kitchen/ProductionOrderStatusSelect";
import { RecipePaxCalculator } from "@/components/kitchen/RecipePaxCalculator";
import { formatTime12 } from "@/lib/format";
import { MenuPlanDishRequirements } from "@/components/kitchen/MenuPlanDishRequirements";

export default async function ProductionOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();

  let order;
  try {
    order = await getProductionOrder(supabase, id);
  } catch {
    notFound();
  }

  const recipe = order.recipe_id ? await getRecipe(supabase, order.recipe_id) : null;
  const menuPlanDish = order.menu_plan_dish_id ? await getMenuPlanDishWithIngredients(supabase, order.menu_plan_dish_id) : null;
  const eventMenu = orderMenuItems(order);
  const targetPax =order.pax_count ?? order.catering_events?.pax_count ?? recipe?.yield_pax ?? 0;
  // the kitchen's times: those of the event day this order is for, or of the event itself (single-day event)
  const setupTime = (order.catering_event_days?.setup_time ?? order.catering_events?.setup_time)?.slice(0, 5) ?? null;
  const eventTime = (order.catering_event_days?.event_time ?? order.catering_events?.event_time)?.slice(0, 5) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/kitchen${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Production Schedule
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{recipe?.name ?? menuPlanDish?.name ?? "Production Order"}</div>
          <div className="text-[13px] text-text-secondary">
            {order.companies?.name} · Planned {order.planned_date}
            {order.catering_events?.event_name && ` · For event: ${order.catering_events.event_name}`}
            {order.catering_event_days?.day_date && ` (day ${order.catering_event_days.day_date})`}
          </div>
        </div>
        <ProductionOrderStatusSelect orderId={id} status={order.status} />
      </div>

      {order.catering_event_id && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Set-up time (kitchen side)</div>
            <div className="mt-1 text-xl font-extrabold text-text">{setupTime ? formatTime12(setupTime) : "—"}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Event time</div>
            <div className="mt-1 text-xl font-extrabold text-text">{eventTime ? formatTime12(eventTime) : "—"}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Pax to Produce</div>
          <div className="mt-1 text-xl font-extrabold text-text">{targetPax || "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Recipe Base Yield</div>
          <div className="mt-1 text-xl font-extrabold text-text">{recipe ? `${recipe.yield_pax} pax` : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Status</div>
          <div className="mt-1 text-xl font-extrabold text-text">{PRODUCTION_STATUS_LABEL[order.status] ?? order.status}</div>
        </div>
      </div>

      {(order.assigned_staff || order.prep_time_minutes != null) && (
        <div className="grid grid-cols-2 gap-4">
          {order.assigned_staff && (
            <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Assigned Kitchen Staff</div>
              {order.assigned_staff}
            </div>
          )}
          {order.prep_time_minutes != null && (
            <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Kitchen Preparation Time</div>
              {order.prep_time_minutes} minutes
            </div>
          )}
        </div>
      )}

      {order.notes && (
        <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Notes</div>
          {order.notes}
        </div>
      )}

      {eventMenu.length > 0 && (
        <SectionCard title="Menu (from Catering)">
          <ul className="list-disc pl-5 text-[13.5px] text-text">
            {eventMenu.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Ingredient Requirements">
        {recipe ? (
          <RecipePaxCalculator recipeIngredients={recipe.recipe_ingredients} yieldPax={recipe.yield_pax} defaultTargetPax={targetPax || recipe.yield_pax} />
        ) : menuPlanDish ? (
          <MenuPlanDishRequirements dishName={menuPlanDish.name} ingredients={menuPlanDish.menu_plan_ingredients} targetPax={targetPax || 1} />
        ) : (
          <p className="text-[13px] text-text-muted">This order isn&apos;t linked to a recipe or menu dish, so ingredient requirements can&apos;t be calculated automatically.</p>
        )}
      </SectionCard>

      {order.status === "completed" && (
        <div className="rounded-lg border border-info-border bg-info-bg px-3.5 py-3 text-[13px] text-info">
          {recipe
            ? `Stock has been deducted for this order and its ingredient cost was recorded${order.catering_event_id ? " against the linked catering event's costing." : "."}`
            : "This order is marked completed. It was linked to a menu-plan dish, not a recipe, so stock was not auto-deducted — log any stock used manually under Kitchen → Stock."}
        </div>
      )}
    </div>
  );
}
