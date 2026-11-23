import Link from "next/link";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { costOfItem, fetchCategories, fetchIngredients, fetchMenuItems, fetchOptions, fetchVersions } from "@/lib/restaurant/menuData";
import { recipeCost } from "@/lib/restaurant/costing";
import { BARA_LIMITS } from "@/lib/monthlyBreakdown/restoranBara";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { MenuItemForm } from "@/components/restaurant/MenuItemForm";
import { OptionsPanel } from "@/components/restaurant/OptionsPanel";
import { RecipeEditor } from "@/components/restaurant/RecipeEditor";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard } from "@/components/dashboard/SectionCard";

const money = (v: number) => formatCurrency(Math.round(v * 100) / 100);
const dateTime = (iso: string) => formatMalaysiaDate(iso);

export default async function MenuItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;

  const [categories, items, ingredients, options, { versions, currentByItem }] = await Promise.all([
    fetchCategories(ctx.db, ctx.company.id),
    fetchMenuItems(ctx.db, ctx.company.id),
    fetchIngredients(ctx.db, ctx.company.id),
    fetchOptions(ctx.db, ctx.company.id, id),
    fetchVersions(ctx.db, ctx.company.id, id),
  ]);
  const item = items.find((i) => i.id === id);
  if (!item) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[22px] font-extrabold text-text">Menu item</h1>
        <div className="rounded-3xl border border-border bg-surface p-5 text-[13px] text-text-muted shadow-sm">This menu item was not found. <Link href={`/restaurant/menu${ctx.query}`} className="text-primary hover:underline">Back to the menu</Link></div>
      </div>
    );
  }

  const cost = costOfItem(item, versions, currentByItem);
  const latest = versions[0] ?? null; // newest first
  const currentId = currentByItem.get(item.id) ?? null;
  const limit = BARA_LIMITS.raw * 100;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">{item.name}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{ctx.company.name} · {item.code} · <Link href={`/restaurant/menu${ctx.query}`} className="text-primary hover:underline">Back to the menu</Link></p>
      </div>
      <RestaurantSubNav isAdmin={ctx.can.roles} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Menu price", item.price === null ? "not set" : money(item.price)],
          ["Cost per portion", cost.cost?.complete ? money(cost.cost.perPortion as number) : "cost incomplete"],
          ["Food cost %", cost.margin.foodCostPct === null ? "—" : `${cost.margin.foodCostPct.toFixed(1)}%`],
          ["Profit per serving", cost.margin.profit === null ? "—" : money(cost.margin.profit)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
            <div className="text-[12px] font-semibold text-text-secondary">{label}</div>
            <div className={`mt-1 text-[18px] font-extrabold ${label === "Food cost %" && cost.margin.foodCostPct !== null && cost.margin.foodCostPct > limit ? "text-danger" : "text-text"}`}>{value}</div>
          </div>
        ))}
      </div>
      {cost.state === "draft" && <div className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-warning">These figures come from a draft recipe: no version is approved yet.</div>}
      {cost.state === "none" && <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-muted">No recipe yet, so the cost is not known.</div>}

      <MenuItemForm companyId={ctx.company.id} item={item} categories={categories} canEdit={ctx.can.menu} canPrice={ctx.can.manage} query={ctx.query} />
      <OptionsPanel companyId={ctx.company.id} menuItemId={item.id} options={options} canEdit={ctx.can.menu} canPrice={ctx.can.manage} />
      <RecipeEditor menuItemId={item.id} price={item.price} ingredients={ingredients} latest={latest} canEdit={ctx.can.menu} canApprove={ctx.can.manage} />

      <SectionCard title={`Recipe versions (${versions.length})`}>
        {versions.length === 0 ? (
          <div className="py-3 text-[13px] text-text-muted">No version yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {versions.map((v) => {
              const c = recipeCost(v.lines, v.portion_yield);
              return (
                <details key={v.id} className="rounded-xl border border-border px-4 py-3" open={v.id === latest?.id && versions.length === 1}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
                    <span className="font-bold text-text">{`Version ${v.version_no}`}</span>
                    <StatusBadge tone={v.status === "approved" ? "success" : "warning"}>{v.status === "approved" ? "Approved" : "Draft"}</StatusBadge>
                    {v.id === currentId && <StatusBadge tone="info">Current</StatusBadge>}
                    <span className="text-text-secondary">{`${dateTime(v.created_at)} · ${v.created_by_name ?? "—"}`}</span>
                    <span className="ml-auto font-semibold">{c.complete ? `${money(c.perPortion as number)} per portion` : "cost incomplete"}</span>
                  </summary>
                  <div className="mt-3 text-[13px] text-text-secondary">
                    {v.change_note && <div className="mb-1">{`What changed: ${v.change_note}`}</div>}
                    {v.approved_at && <div className="mb-1">{`Approved ${dateTime(v.approved_at)} by ${v.approved_by_name ?? "—"}`}</div>}
                    <div className="mb-2">{`Makes ${v.portion_yield} portion${v.portion_yield === 1 ? "" : "s"}${v.portion_text ? ` · ${v.portion_text}` : ""}`}</div>
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-border text-left text-[12px] text-text-muted">
                          <th className="py-1.5 font-semibold">Ingredient</th>
                          <th className="py-1.5 text-right font-semibold">Quantity</th>
                          <th className="py-1.5 text-right font-semibold">Waste %</th>
                          <th className="py-1.5 text-right font-semibold">Unit cost then</th>
                          <th className="py-1.5 text-right font-semibold">Yield %</th>
                          <th className="py-1.5 text-right font-semibold">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.lines.map((l, i) => (
                          <tr key={l.id} className="border-b border-border last:border-0">
                            <td className="py-1.5">{l.ingredient_name}</td>
                            <td className="py-1.5 text-right">{`${l.quantity} ${l.unit}`}</td>
                            <td className="py-1.5 text-right">{l.waste_pct}</td>
                            <td className="py-1.5 text-right">{l.unit_cost === null ? "—" : `${money(l.unit_cost)} / ${l.cost_unit ?? "?"}`}</td>
                            <td className="py-1.5 text-right">{l.yield_pct}</td>
                            <td className="py-1.5 text-right font-semibold">{c.lines[i].cost === null ? "—" : money(c.lines[i].cost as number)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {v.instructions && <div className="mt-2 whitespace-pre-line">{v.instructions}</div>}
                  </div>
                </details>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[12px] text-text-muted">An approved version is never changed: a change makes a new version. Each version keeps the unit costs it was saved with, so an old cost stays readable.</p>
      </SectionCard>
    </div>
  );
}
