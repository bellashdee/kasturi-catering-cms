import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCostCategories } from "@/lib/finance/queries";
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

  const categories = await listCostCategories(supabase, targetCompanyIds);

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
              <div key={c.id} className="flex items-center justify-between px-5 py-3 text-[13.5px]">
                <span className="font-semibold text-text">{c.name}</span>
                <span className="text-xs text-text-muted">{c.company_id ? "Company-specific" : "Global default"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
