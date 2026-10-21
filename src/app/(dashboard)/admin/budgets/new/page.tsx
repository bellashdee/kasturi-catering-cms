import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCostCategories, uniqueCategories } from "@/lib/finance/queries";
import { BudgetForm } from "@/components/finance/BudgetForm";

export default async function NewBudgetPage({
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

  const categories = await listCostCategories(supabase, accessibleIds);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">New Budget</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <BudgetForm companies={selectable} defaultCompanyId={defaultCompanyId} categories={uniqueCategories(categories)} />
      </div>
    </div>
  );
}
