import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listStockMovementsForCompanies, listIngredients } from "@/lib/kitchen/queries";
import { MOVEMENT_TYPE_LABEL, isLowStock } from "@/lib/kitchen/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const [movements, ingredients] = await Promise.all([
    listStockMovementsForCompanies(supabase, targetCompanyIds),
    listIngredients(supabase, targetCompanyIds),
  ]);

  const lowStockIngredients = ingredients.filter((i) => isLowStock(Number(i.current_stock_qty), Number(i.reorder_level)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">Stock movement ledger</p>
        </div>
        <Link href={`/kitchen/stock/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Stock Entry
        </Link>
      </div>

      <KitchenSubNav />

      {lowStockIngredients.length > 0 && (
        <SectionCard title={`Low Stock (${lowStockIngredients.length})`}>
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {lowStockIngredients.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                <div>
                  <Link href={`/kitchen/ingredients/${i.id}${query}`} className="font-semibold text-text hover:underline">{i.name}</Link>
                  <span className="ml-2 text-text-muted">{i.companies?.name}</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                  {i.current_stock_qty} {i.unit_of_measure ?? ""} (reorder at {i.reorder_level})
                  <StatusBadge tone="warning">Low</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {movements.length === 0 ? (
          <EmptyRow text="No stock movements yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.4fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Ingredient</div>
              <div>Type</div>
              <div>Quantity</div>
              <div>Company</div>
              <div>Notes</div>
            </div>
            {movements.map((m) => (
              <div key={m.id} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.4fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                <div className="font-semibold text-text">{m.ingredients?.name ?? "—"}</div>
                <div className="text-text-secondary">{MOVEMENT_TYPE_LABEL[m.movement_type] ?? m.movement_type}</div>
                <div className="text-text-secondary">{Number(m.quantity) > 0 ? "+" : ""}{m.quantity} {m.ingredients?.unit_of_measure ?? ""}</div>
                <div className="text-text-secondary">{m.companies?.name}</div>
                <div className="truncate text-text-muted">{m.notes ?? "—"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
