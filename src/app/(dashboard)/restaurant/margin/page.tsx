import Link from "next/link";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { costOfItem, fetchCategories, fetchMenuItems, fetchVersions } from "@/lib/restaurant/menuData";
import { BARA_LIMITS } from "@/lib/monthlyBreakdown/restoranBara";
import { formatCurrency } from "@/lib/format";
import { readSort, sortBy } from "@/lib/listSort";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { Select } from "@/components/ui/Select";

const SORTS = { profit: "Profit per serving", foodcost: "Food cost %", margin: "Gross margin %", price: "Price", cost: "Cost per portion", name: "Name", category: "Category" };
const money = (v: number) => formatCurrency(Math.round(v * 100) / 100);
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

export default async function MarginReportPage({ searchParams }: { searchParams: Promise<{ company?: string; q?: string; category?: string; flag?: string; sort?: string; dir?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;

  const [categories, items, { versions, currentByItem }] = await Promise.all([fetchCategories(ctx.db, ctx.company.id), fetchMenuItems(ctx.db, ctx.company.id), fetchVersions(ctx.db, ctx.company.id)]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const limit = BARA_LIMITS.raw * 100; // the raw item limit of the Monthly Breakdown
  const flag = ["over", "ok", "incomplete", "norecipe"].includes(sp.flag ?? "") ? (sp.flag as string) : "";
  const q = (sp.q ?? "").trim().toUpperCase();
  const { sort, dir } = readSort(sp, SORTS, "profit", "desc");

  type Row = { id: string; name: string; code: string; category: string; categoryId: string | null; price: number | null; cost: number | null; profit: number | null; foodCost: number | null; marginPct: number | null; state: "approved" | "draft" | "none"; incomplete: boolean; over: boolean };
  const all: Row[] = items
    .filter((i) => i.is_active)
    .map((i) => {
      const c = costOfItem(i, versions, currentByItem);
      const complete = c.cost?.complete === true;
      const perPortion = complete ? (c.cost?.perPortion as number) : null;
      return {
        id: i.id,
        name: i.name,
        code: i.code,
        category: i.category_id ? catName.get(i.category_id) ?? "" : "",
        categoryId: i.category_id,
        price: i.price,
        cost: perPortion,
        profit: c.margin.profit,
        foodCost: c.margin.foodCostPct,
        marginPct: c.margin.marginPct,
        state: c.state,
        incomplete: c.state !== "none" && !complete,
        over: c.margin.foodCostPct !== null && c.margin.foodCostPct > limit,
      };
    });

  const filtered = all
    .filter((r) => !sp.category || r.categoryId === sp.category)
    .filter((r) => !q || `${r.code} ${r.name}`.toUpperCase().includes(q))
    .filter((r) => (flag === "over" ? r.over : flag === "ok" ? r.foodCost !== null && !r.over : flag === "incomplete" ? r.incomplete : flag === "norecipe" ? r.state === "none" : true));
  const rows = sortBy(filtered, sort, dir, {
    profit: (r) => r.profit,
    foodcost: (r) => r.foodCost,
    margin: (r) => r.marginPct,
    price: (r) => r.price,
    cost: (r) => r.cost,
    name: (r) => r.name,
    category: [(r) => r.category, (r) => r.name],
  });

  const known = all.filter((r) => r.foodCost !== null);
  const overCount = all.filter((r) => r.over).length;
  const incompleteCount = all.filter((r) => r.incomplete).length;
  const noRecipe = all.filter((r) => r.state === "none").length;
  const avgFoodCost = known.length > 0 ? known.reduce((t, r) => t + (r.foodCost as number), 0) / known.length : null;
  const top = [...known].sort((a, b) => (b.profit as number) - (a.profit as number)).slice(0, 5);

  // by category
  const byCategory = new Map<string, { name: string; items: number; known: number; fcSum: number; profitSum: number }>();
  for (const r of all) {
    const key = r.categoryId ?? "";
    const cur = byCategory.get(key) ?? { name: r.category || "No category", items: 0, known: 0, fcSum: 0, profitSum: 0 };
    cur.items += 1;
    if (r.foodCost !== null) {
      cur.known += 1;
      cur.fcSum += r.foodCost;
      cur.profitSum += r.profit as number;
    }
    byCategory.set(key, cur);
  }

  const statusText = (r: Row) => (r.state === "none" ? "No recipe" : r.incomplete ? "Cost incomplete" : r.price === null ? "Price not set" : r.over ? "Over the limit" : r.state === "draft" ? "OK (draft recipe)" : "OK");
  const table = {
    title: "Menu margin report",
    subtitle: `${ctx.company.name} · prices before service charge and SST · limit ${limit.toFixed(0)}% (Monthly Breakdown) · ${rows.length} item${rows.length === 1 ? "" : "s"}`,
    columns: ["Code", "Item", "Category", "Price (RM)", "Cost per portion (RM)", "Profit per serving (RM)", "Food cost %", "Gross margin %", "Status"],
    rows: rows.map((r) => [r.code, r.name, r.category, r.price === null ? "" : r.price.toFixed(2), r.cost === null ? "" : r.cost.toFixed(2), r.profit === null ? "" : r.profit.toFixed(2), r.foodCost === null ? "" : r.foodCost.toFixed(1), r.marginPct === null ? "" : r.marginPct.toFixed(1), statusText(r)]),
    landscape: true,
    moneyColumns: ["Price (RM)", "Cost per portion (RM)", "Profit per serving (RM)"],
  };
  const query = ctx.requestedCompany ? `?company=${ctx.requestedCompany}` : "";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Menu margin report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{ctx.company.name} · prices are before service charge and SST · cost from the current approved recipe</p>
      </div>
      <RestaurantSubNav isAdmin={ctx.can.roles} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon="costing" label="Active menu items" value={String(all.length)} hint={`${known.length} with a complete cost and a price`} />
        <KpiCard icon="sales" label="Average food cost %" value={pct(avgFoodCost)} hint={`Limit ${limit.toFixed(0)}% (Monthly Breakdown, raw items)`} tone={avgFoodCost !== null && avgFoodCost > limit ? "danger" : "neutral"} />
        <KpiCard icon="approvals" label="Over the limit" value={String(overCount)} hint="Food cost % above the limit" tone={overCount > 0 ? "danger" : "success"} />
        <KpiCard icon="calendar" label="Cost incomplete / no recipe" value={`${incompleteCount} / ${noRecipe}`} hint="No figure is shown for these" tone={incompleteCount + noRecipe > 0 ? "warning" : "success"} />
      </div>

      <ListFilters keep={{ company: ctx.requestedCompany }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/restaurant/margin${query}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Code or name…" className={`${FILTER_INPUT} w-48`} />
        </FilterField>
        <FilterField label="Category">
          <Select name="category" defaultValue={sp.category ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Show">
          <Select name="flag" defaultValue={flag} className={`${FILTER_INPUT} w-52`}>
            <option value="">All items</option>
            <option value="over">Over the limit</option>
            <option value="ok">Within the limit</option>
            <option value="incomplete">Cost incomplete</option>
            <option value="norecipe">No recipe</option>
          </Select>
        </FilterField>
      </ListFilters>

      <div className="flex justify-end"><ExportButtons table={table} /></div>

      <div className="rounded-3xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto p-2 sm:p-4">
          {rows.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-text-muted">{all.length === 0 ? "No menu item yet. Add the menu and the recipes first." : "No item matches these filters."}</div>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-muted">
                  <th className="px-2 py-2 font-semibold">Item</th>
                  <th className="px-2 py-2 font-semibold">Category</th>
                  <th className="px-2 py-2 text-right font-semibold">Price</th>
                  <th className="px-2 py-2 text-right font-semibold">Cost per portion</th>
                  <th className="px-2 py-2 text-right font-semibold">Profit per serving</th>
                  <th className="px-2 py-2 text-right font-semibold">Food cost %</th>
                  <th className="px-2 py-2 text-right font-semibold">Gross margin %</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-2"><Link href={`/restaurant/menu/${r.id}${query}`} className="font-semibold text-primary hover:underline">{r.name}</Link><div className="text-[11.5px] text-text-muted">{r.code}</div></td>
                    <td className="px-2 py-2">{r.category || "—"}</td>
                    <td className="px-2 py-2 text-right">{r.price === null ? <span className="text-warning">not set</span> : money(r.price)}</td>
                    <td className="px-2 py-2 text-right">{r.cost === null ? <span className="text-warning">{r.state === "none" ? "no recipe" : "cost incomplete"}</span> : money(r.cost)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{r.profit === null ? "—" : money(r.profit)}</td>
                    <td className={`px-2 py-2 text-right ${r.over ? "font-bold text-danger" : ""}`}>{pct(r.foodCost)}</td>
                    <td className="px-2 py-2 text-right">{pct(r.marginPct)}</td>
                    <td className="px-2 py-2">
                      {r.state === "none" ? <StatusBadge tone="neutral">No recipe</StatusBadge> : r.incomplete ? <StatusBadge tone="warning">Cost incomplete</StatusBadge> : r.price === null ? <StatusBadge tone="warning">Price not set</StatusBadge> : r.over ? <StatusBadge tone="danger">Over the limit</StatusBadge> : <StatusBadge tone="success">{r.state === "draft" ? "OK (draft recipe)" : "OK"}</StatusBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="By category">
          {byCategory.size === 0 ? (
            <EmptyRow text="No menu item yet." />
          ) : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-muted">
                  <th className="py-2 font-semibold">Category</th>
                  <th className="py-2 text-right font-semibold">Items</th>
                  <th className="py-2 text-right font-semibold">With a cost</th>
                  <th className="py-2 text-right font-semibold">Avg food cost %</th>
                  <th className="py-2 text-right font-semibold">Avg profit</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byCategory.values()).sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                  <tr key={c.name} className="border-b border-border last:border-0">
                    <td className="py-2">{c.name}</td>
                    <td className="py-2 text-right">{c.items}</td>
                    <td className="py-2 text-right">{c.known}</td>
                    <td className={`py-2 text-right ${c.known > 0 && c.fcSum / c.known > limit ? "font-bold text-danger" : ""}`}>{c.known > 0 ? pct(c.fcSum / c.known) : "—"}</td>
                    <td className="py-2 text-right">{c.known > 0 ? money(c.profitSum / c.known) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
        <SectionCard title="Highest profit per serving">
          {top.length === 0 ? (
            <EmptyRow text="No item has a complete cost and a price yet." />
          ) : (
            <table className="w-full text-[13.5px]">
              <tbody>
                {top.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2"><Link href={`/restaurant/menu/${r.id}${query}`} className="text-primary hover:underline">{r.name}</Link></td>
                    <td className="py-2 text-right text-text-secondary">{pct(r.foodCost)}</td>
                    <td className="py-2 text-right font-semibold">{money(r.profit as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>
      <p className="text-[12px] text-text-muted">Food cost % = cost per portion ÷ price. The limit is read from the Monthly Breakdown of Restoran Bara. An item without a recipe, or with a line that has no cost, shows no figure: it is never counted as RM 0.</p>
    </div>
  );
}
