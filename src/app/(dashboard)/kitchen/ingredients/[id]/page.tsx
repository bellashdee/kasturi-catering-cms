import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getIngredient, listStockMovementsForIngredient } from "@/lib/kitchen/queries";
import { MOVEMENT_TYPE_LABEL, isLowStock } from "@/lib/kitchen/constants";
import { formatUnitPrice } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { StockMovementForm } from "@/components/kitchen/StockMovementForm";

export default async function IngredientDetailPage({
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

  let ingredient;
  try {
    ingredient = await getIngredient(supabase, id);
  } catch {
    notFound();
  }

  const movements = await listStockMovementsForIngredient(supabase, id);
  const low = isLowStock(Number(ingredient.current_stock_qty), Number(ingredient.reorder_level));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/kitchen/ingredients${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Ingredients
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{ingredient.name}</div>
          <div className="text-[13px] text-text-secondary">{ingredient.companies?.name}</div>
        </div>
        <Link href={`/kitchen/ingredients/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Current Stock</div>
          <div className="mt-1 flex items-center gap-2 text-xl font-extrabold text-text">
            {ingredient.current_stock_qty} {ingredient.unit_of_measure ?? ""}
            {low && <StatusBadge tone="warning">Low</StatusBadge>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Reorder Level</div>
          <div className="mt-1 text-xl font-extrabold text-text">{ingredient.reorder_level} {ingredient.unit_of_measure ?? ""}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Unit Cost</div>
          <div className="mt-1 text-xl font-extrabold text-text">{Number(ingredient.unit_cost) > 0 ? `${formatUnitPrice(Number(ingredient.unit_cost))}${ingredient.unit_of_measure ? ` / ${ingredient.unit_of_measure}` : ""}` : "—"}</div>
        </div>
      </div>

      {low && (
        <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning-bg px-4 py-3 text-[13px] text-warning">
          <span>Stock is at or below the reorder level.</span>
          <Link href={`/kitchen/purchase-requests/new?ingredient=${id}${requestedId ? `&company=${requestedId}` : ""}`} className="font-bold underline">
            Create Purchase Request
          </Link>
        </div>
      )}

      <SectionCard title="Adjust Stock">
        <StockMovementForm companyId={ingredient.company_id} ingredients={[]} fixedIngredientId={id} />
      </SectionCard>

      <SectionCard title="Recent Stock Movements">
        {movements.length === 0 ? (
          <EmptyRow text="No stock movements recorded yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <span className="font-semibold text-text">{MOVEMENT_TYPE_LABEL[m.movement_type] ?? m.movement_type}</span>
                  <span className="ml-2 text-text-secondary">{Number(m.quantity) > 0 ? "+" : ""}{m.quantity} {ingredient.unit_of_measure ?? ""}</span>
                  {m.notes && <span className="ml-2 text-text-muted">— {m.notes}</span>}
                </div>
                <div className="text-text-muted">{new Date(m.created_at).toLocaleString("en-MY")}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
