import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getMenuPlanTree } from "@/lib/menuPlan/queries";
import { ProductionOrderForm } from "@/components/kitchen/ProductionOrderForm";

export default async function NewProductionOrderPage({
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
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, name, yield_pax, company_id")
    .in("company_id", accessibleIds)
    .order("name");

  const menuPlanTrees = Object.fromEntries(
    await Promise.all(selectable.map(async (c) => [c.id, await getMenuPlanTree(supabase, c.id)] as const)),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">New Production Order</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <ProductionOrderForm
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          recipes={recipes ?? []}
          menuPlanTrees={menuPlanTrees}
        />
      </div>
    </div>
  );
}
