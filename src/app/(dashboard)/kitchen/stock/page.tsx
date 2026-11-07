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
import { UNCATEGORISED, categoryOf, latestPurchasePrices } from "@/lib/kitchen/itemPrices";
import { normaliseName } from "@/lib/purchaseList/calc";
import { formatPrice, formatUnitPrice } from "@/lib/format";
import { MonthFilter } from "@/components/MonthFilter";
import { monthLabelOf } from "@/lib/monthFilter";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, month } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const [movements, ingredients, purchasePrices] = await Promise.all([
    listStockMovementsForCompanies(supabase, targetCompanyIds, month),
    listIngredients(supabase, targetCompanyIds),
    latestPurchasePrices(supabase, targetCompanyIds),
  ]);

  const monthLabel = monthLabelOf(month);

  // every item with its price (the stock item's own unit cost, else the latest purchase order price), grouped by category
  const priced = ingredients.map((i) => {
    const own = Number(i.unit_cost);
    const fromPo = purchasePrices.get(`${i.company_id}|${normaliseName(i.name)}`);
    const price = own > 0 ? own : fromPo?.price ?? null;
    return { ...i, category: categoryOf(i.category), price, priceSource: own > 0 ? ("item" as const) : fromPo ? ("po" as const) : null, stockValue: price === null ? null : price * Number(i.current_stock_qty) };
  });
  const byCategory = new Map<string, typeof priced>();
  for (const i of priced) byCategory.set(i.category, [...(byCategory.get(i.category) ?? []), i]);
  const categories = [...byCategory.entries()].sort(([a], [b]) => (a === UNCATEGORISED ? 1 : b === UNCATEGORISED ? -1 : a.localeCompare(b)));
  const allUncategorised = categories.length === 1 && categories[0][0] === UNCATEGORISED;
  const withoutPrice = priced.filter((i) => i.price === null).length;
  const slug = (c: string) => `cat-${c.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const lowStockIngredients = ingredients.filter((i) => isLowStock(Number(i.current_stock_qty), Number(i.reorder_level)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">Stock movements{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <Link href={`/kitchen/stock/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Stock Entry
        </Link>
      </div>

      <KitchenSubNav />

      <SectionCard title={`Items and prices by category (${ingredients.length})`}>
        {ingredients.length === 0 ? (
          <EmptyRow text="No stock items yet." />
        ) : (
          <div className="flex flex-col gap-4">
            {(allUncategorised || withoutPrice > 0) && (
              <div className="rounded-lg border border-border bg-surface-alt px-3.5 py-2.5 text-[14px] text-text-secondary">
                {allUncategorised && <div>No item has a category yet, so all items are listed under <b className="text-text">Uncategorised</b>. </div>}
                {withoutPrice > 0 && <div>{withoutPrice} of {ingredients.length} items have no price yet. </div>}
                <div>Add the category and unit cost in Kitchen → Ingredients (edit an item, or import an Excel/CSV with Category and Unit Cost columns). Until then the price shown is the latest purchase order price, if there is one.</div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {categories.map(([name, items]) => (
                <a key={name} href={`#${slug(name)}`} className="rounded-full border border-border-strong bg-surface px-3 py-1 text-[13px] font-semibold text-text hover:bg-bg">
                  {name === UNCATEGORISED ? "Uncategorised" : name} <span className="text-text-secondary">· {items.length}</span>
                </a>
              ))}
            </div>
            {categories.map(([name, items]) => {
              const value = items.reduce((t, i) => t + (i.stockValue ?? 0), 0);
              return (
                <details key={name} id={slug(name)} open className="overflow-hidden rounded-lg border border-border">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 bg-surface-alt px-4 py-2.5">
                    <span className="text-[15px] font-bold text-text">{name === UNCATEGORISED ? "Uncategorised" : name} <span className="font-semibold text-text-secondary">· {items.length}</span></span>
                    <span className="text-[13.5px] text-text-secondary">Stock value: <b className="text-text">{formatPrice(value)}</b></span>
                  </summary>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-[14px]">
                      <thead>
                        <tr className="border-b border-border text-left text-[12.5px] font-bold text-text-secondary">
                          <th className="px-4 py-2">Item</th>
                          <th className="px-3 py-2">Unit</th>
                          <th className="px-3 py-2 text-right">In stock</th>
                          <th className="px-3 py-2 text-right">Price (RM per unit)</th>
                          <th className="px-4 py-2 text-right">Stock value (RM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((i) => (
                          <tr key={i.id}>
                            <td className="px-4 py-2">
                              <Link href={`/kitchen/ingredients/${i.id}${query}`} className="font-semibold text-text hover:underline">{i.name}</Link>
                              {companies.length > 1 && <span className="ml-2 text-[12.5px] text-text-secondary">{i.companies?.name}</span>}
                            </td>
                            <td className="px-3 py-2 text-text-secondary">{i.unit_of_measure ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-text">{Number(i.current_stock_qty)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-text">
                              {i.price === null ? <span className="text-text-secondary">—</span> : formatUnitPrice(i.price)}
                              {i.priceSource === "po" && <span className="ml-1.5 text-[12px] font-semibold text-primary">PO</span>}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold tabular-nums text-text">{i.stockValue === null ? "—" : formatPrice(i.stockValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
            <p className="text-[13px] text-text-secondary">&quot;PO&quot; means the price is the latest purchase order price of that item (the item has no unit cost of its own).</p>
          </div>
        )}
      </SectionCard>

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

      <MonthFilter />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {movements.length === 0 ? (
          <EmptyRow text={monthLabel ? "No stock movements in this month." : "No stock movements yet."} />
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
