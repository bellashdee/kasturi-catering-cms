import Link from "next/link";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { costOfItem, fetchCategories, fetchMenuItems, fetchVersions, stationLabel, STATIONS } from "@/lib/restaurant/menuData";
import { formatCurrency } from "@/lib/format";
import { readSort, sortBy } from "@/lib/listSort";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { CategoriesPanel } from "@/components/restaurant/CategoriesPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { Select } from "@/components/ui/Select";
import { SPEND_SAVE_BTN } from "@/components/spending/formStyles";

const SORTS = { name: "Name", code: "Code", category: "Category", price: "Price", station: "Station" };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ company?: string; q?: string; category?: string; station?: string; show?: string; sort?: string; dir?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;

  const [categories, items, { versions, currentByItem }] = await Promise.all([fetchCategories(ctx.db, ctx.company.id), fetchMenuItems(ctx.db, ctx.company.id), fetchVersions(ctx.db, ctx.company.id)]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const q = (sp.q ?? "").trim().toUpperCase();
  const show = sp.show === "all" || sp.show === "inactive" || sp.show === "unavailable" ? sp.show : "active";
  const { sort, dir } = readSort(sp, SORTS, "name", "asc");

  const rows = items
    .filter((i) => (show === "all" ? true : show === "inactive" ? !i.is_active : show === "unavailable" ? i.is_active && !i.is_available : i.is_active))
    .filter((i) => !sp.category || i.category_id === sp.category)
    .filter((i) => !sp.station || i.station === sp.station)
    .filter((i) => !q || `${i.code} ${i.name} ${i.description ?? ""} ${i.feedme_name ?? ""}`.toUpperCase().includes(q))
    .map((i) => ({ item: i, category: i.category_id ? catName.get(i.category_id) ?? "" : "", cost: costOfItem(i, versions, currentByItem) }));
  const sorted = sortBy(rows, sort, dir, {
    name: (r) => r.item.name,
    code: (r) => r.item.code,
    category: [(r) => r.category, (r) => r.item.name],
    price: (r) => r.item.price,
    station: [(r) => stationLabel(r.item.station), (r) => r.item.name],
  });

  const query = ctx.requestedCompany ? `?company=${ctx.requestedCompany}` : "";
  const recipeText = (r: (typeof rows)[number]) => (r.cost.state === "approved" ? `Approved v${r.cost.version?.version_no}` : r.cost.state === "draft" ? `Draft v${r.cost.version?.version_no}` : "No recipe");
  const table = {
    title: "Menu",
    subtitle: `${ctx.company.name} · ${sorted.length} item${sorted.length === 1 ? "" : "s"}`,
    columns: ["Code", "Name", "Category", "Price (RM, before service charge and SST)", "Station", "Prep (min)", "Recipe", "Available", "Active", "FeedMe name"],
    rows: sorted.map((r) => [r.item.code, r.item.name, r.category, r.item.price === null ? "" : r.item.price.toFixed(2), stationLabel(r.item.station) === "—" ? "" : stationLabel(r.item.station), r.item.prep_minutes === null ? "" : String(r.item.prep_minutes), recipeText(r), r.item.is_available ? "Yes" : "No", r.item.is_active ? "Yes" : "No", r.item.feedme_name ?? ""]),
    landscape: true,
    moneyColumns: ["Price (RM, before service charge and SST)"],
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Menu</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{ctx.company.name} · prices are before the service charge and SST that FeedMe adds on the bill</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/restaurant/menu/feedme${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Match with FeedMe</Link>
          {ctx.can.menu && <Link href={`/restaurant/menu/new${query}`} className={SPEND_SAVE_BTN}>+ New menu item</Link>}
        </div>
      </div>

      <RestaurantSubNav isAdmin={ctx.can.roles} />
      <CategoriesPanel companyId={ctx.company.id} categories={categories} canEdit={ctx.can.menu} />

      <ListFilters keep={{ company: ctx.requestedCompany }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/restaurant/menu${query}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Code, name, FeedMe name…" className={`${FILTER_INPUT} w-56`} />
        </FilterField>
        <FilterField label="Category">
          <Select name="category" defaultValue={sp.category ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Station">
          <Select name="station" defaultValue={sp.station ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All stations</option>
            {STATIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Show">
          <Select name="show" defaultValue={show} className={`${FILTER_INPUT} w-44`}>
            <option value="active">Active items</option>
            <option value="unavailable">Temporarily unavailable</option>
            <option value="inactive">Deactivated</option>
            <option value="all">All</option>
          </Select>
        </FilterField>
      </ListFilters>

      <div className="flex justify-end"><ExportButtons table={table} /></div>

      <div className="rounded-3xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto p-2 sm:p-4">
          {sorted.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-text-muted">{items.length === 0 ? "No menu item yet. Add the first one, or bring the product names of FeedMe with Match with FeedMe." : "No menu item matches these filters."}</div>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-muted">
                  <th className="px-2 py-2 font-semibold">Code</th>
                  <th className="px-2 py-2 font-semibold">Name</th>
                  <th className="px-2 py-2 font-semibold">Category</th>
                  <th className="px-2 py-2 text-right font-semibold">Price</th>
                  <th className="px-2 py-2 font-semibold">Station</th>
                  <th className="px-2 py-2 text-right font-semibold">Prep (min)</th>
                  <th className="px-2 py-2 font-semibold">Recipe</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.item.id} className={`border-b border-border last:border-0 ${r.item.is_active ? "" : "text-text-muted"}`}>
                    <td className="px-2 py-2">{r.item.code}</td>
                    <td className="px-2 py-2"><Link href={`/restaurant/menu/${r.item.id}${query}`} className="font-semibold text-primary hover:underline">{r.item.name}</Link>{r.item.feedme_name && <div className="text-[11.5px] text-text-muted">{`FeedMe: ${r.item.feedme_name}`}</div>}</td>
                    <td className="px-2 py-2">{r.category || "—"}</td>
                    <td className="px-2 py-2 text-right">{r.item.price === null ? <span className="text-warning">not set</span> : formatCurrency(r.item.price)}</td>
                    <td className="px-2 py-2">{stationLabel(r.item.station)}</td>
                    <td className="px-2 py-2 text-right">{r.item.prep_minutes ?? "—"}</td>
                    <td className="px-2 py-2"><StatusBadge tone={r.cost.state === "approved" ? "success" : r.cost.state === "draft" ? "warning" : "neutral"}>{recipeText(r)}</StatusBadge></td>
                    <td className="px-2 py-2">
                      {!r.item.is_active ? <StatusBadge tone="neutral">Deactivated</StatusBadge> : r.item.is_available ? <StatusBadge tone="success">Available</StatusBadge> : <StatusBadge tone="warning">Temporarily unavailable</StatusBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
