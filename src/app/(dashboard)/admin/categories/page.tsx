import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCostCategories } from "@/lib/finance/queries";
import { CategoryRow } from "@/components/finance/CategoryRow";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { CostCategoryForm } from "@/components/finance/CostCategoryForm";

export default async function CostCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const rawCategories = await listCostCategories(supabase, targetCompanyIds);
  // the same category (also written Other / OTHER) kept by several companies is one row, with all its companies; alphabetical
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const groups = new Map<string, { name: string; ids: string[]; companyNames: string[]; isDefault: boolean }>();
  for (const c of rawCategories) {
    const key = c.name.toUpperCase().replace(/\s+/g, " ").trim();
    const g = groups.get(key) ?? { name: c.name, ids: [], companyNames: [], isDefault: false };
    if (c.name === c.name.toUpperCase() && g.name !== g.name.toUpperCase()) g.name = c.name;
    if (c.company_id) {
      g.ids.push(c.id);
      g.companyNames.push(companyName.get(c.company_id) ?? "");
    } else {
      g.isDefault = true;
    }
    groups.set(key, g);
  }
  const categories = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Cost Categories — used across Company Expenses and Budgets</p>
      </div>

      <FinanceAdminSubNav />

      <CostCategoryForm companies={selectable} defaultCompanyId={defaultCompanyId} />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {categories.length === 0 ? (
          <EmptyRow text="No categories yet." />
        ) : (
          <div className="divide-y divide-border">
            {categories.map((c) => (
              <CategoryRow
                key={c.name.toUpperCase()}
                ids={c.ids}
                name={c.name}
                companyName={[...c.companyNames, ...(c.isDefault ? ["Global default"] : [])].join(" / ")}
                editable={c.ids.length > 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
