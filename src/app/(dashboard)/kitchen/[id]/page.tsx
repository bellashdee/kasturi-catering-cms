import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getProductionOrder, getRecipe } from "@/lib/kitchen/queries";
import { PRODUCTION_STATUS_LABEL } from "@/lib/kitchen/constants";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { ProductionOrderStatusSelect } from "@/components/kitchen/ProductionOrderStatusSelect";
import { RecipePaxCalculator } from "@/components/kitchen/RecipePaxCalculator";

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
  const targetPax = order.pax_count ?? order.catering_events?.pax_count ?? recipe?.yield_pax ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/kitchen${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Production Schedule
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{recipe?.name ?? "Production Order"}</div>
          <div className="text-[13px] text-text-secondary">
            {order.companies?.name} · Planned {order.planned_date}
            {order.catering_events?.event_name && ` · For event: ${order.catering_events.event_name}`}
          </div>
        </div>
        <ProductionOrderStatusSelect orderId={id} status={order.status} />
      </div>

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

      {order.notes && (
        <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Notes</div>
          {order.notes}
        </div>
      )}

      <SectionCard title="Ingredient Requirements (Recipe + Pax)">
        {recipe ? (
          <RecipePaxCalculator recipeIngredients={recipe.recipe_ingredients} yieldPax={recipe.yield_pax} defaultTargetPax={targetPax || recipe.yield_pax} />
        ) : (
          <p className="text-[13px] text-text-muted">This order isn&apos;t linked to a recipe, so ingredient requirements can&apos;t be calculated automatically.</p>
        )}
      </SectionCard>

      {order.status === "completed" && (
        <div className="rounded-lg border border-[#CFE1F2] bg-info-bg px-3.5 py-3 text-[13px] text-[#0F3A63]">
          Stock has been deducted for this order and its ingredient cost was recorded
          {order.catering_event_id ? " against the linked catering event's costing." : "."}
        </div>
      )}
    </div>
  );
}
