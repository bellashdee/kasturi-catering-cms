import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listIngredients } from "@/lib/kitchen/queries";
import { isLowStock } from "@/lib/kitchen/constants";
import { formatUnitPrice } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { natural, readSort, sortBy } from "@/lib/listSort";

const SORTS = { name: "Name", category: "Category", stock: "Stock", cost: "Unit cost", supplier: "Supplier" };

export default async function IngredientsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string; category?: string; low?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, q, category } = sp;
  const lowOnly = sp.low === "1";
  const { sort, dir } = readSort(sp, SORTS, "name", "asc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const all = await listIngredients(supabase, targetCompanyIds, q);
  const categories = Array.from(new Set(all.map((i) => i.category).filter((c): c is string => !!c))).sort(natural);
  const ingredients = sortBy(
    all.filter((i) => (!category || i.category === category) && (!lowOnly || isLowStock(Number(i.current_stock_qty), Number(i.reorder_level)))),
    sort,
    dir,
    {
      name: (i) => i.name,
      category: [(i) => i.category, (i) => i.name],
      stock: [(i) => Number(i.current_stock_qty), (i) => i.name],
      cost: [(i) => (Number(i.unit_cost) > 0 ? Number(i.unit_cost) : null), (i) => i.name],
      supplier: [(i) => i.suppliers?.name, (i) => i.name],
    },
  );
  const filtered = !!(q || category || lowOnly);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{ingredients.length} ingredient{ingredients.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2.5">
          <Link href={`/kitchen/ingredients/import${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Import Excel/CSV
          </Link>
          <Link href={`/kitchen/ingredients/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Ingredient
          </Link>
        </div>
      </div>

      <KitchenSubNav />
      <ListFilters keep={{ company: requestedId }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/kitchen/ingredients${query}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={q ?? ""} placeholder="Search ingredients by name..." className={`${FILTER_INPUT} w-60`} />
        </FilterField>
        <FilterField label="Category">
          <Select name="category" defaultValue={category ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Show">
          <Select name="low" defaultValue={lowOnly ? "1" : ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All ingredients</option>
            <option value="1">Low stock only</option>
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {ingredients.length === 0 ? (
          <EmptyRow text={filtered ? "No ingredients match these filters." : "No ingredients yet. Add one manually or import from Excel/CSV."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1.4fr_0.9fr_0.9fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Name</div>
              <div>Category</div>
              <div>Company</div>
              <div>Stock</div>
              <div>Reorder Level</div>
              <div>Unit Cost</div>
              <div>Supplier</div>
            </div>
            {ingredients.map((i) => (
              <Link
                key={i.id}
                href={`/kitchen/ingredients/${i.id}${query}`}
                className="grid grid-cols-[1.4fr_0.9fr_0.9fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">{i.name}</div>
                <div className="text-text-secondary">{i.category ?? "—"}</div>
                <div className="text-text-secondary">{i.companies?.name}</div>
                <div className="flex items-center gap-2 text-text-secondary">
                  {i.current_stock_qty} {i.unit_of_measure ?? ""}
                  {isLowStock(Number(i.current_stock_qty), Number(i.reorder_level)) && <StatusBadge tone="warning">Low</StatusBadge>}
                </div>
                <div className="text-text-secondary">{i.reorder_level} {i.unit_of_measure ?? ""}</div>
                <div className="text-text-secondary">{Number(i.unit_cost) > 0 ? `${formatUnitPrice(Number(i.unit_cost))}${i.unit_of_measure ? ` / ${i.unit_of_measure}` : ""}` : "—"}</div>
                <div className="text-text-secondary">{i.suppliers?.name ?? "—"}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
