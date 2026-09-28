import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { IngredientForm } from "@/components/kitchen/IngredientForm";

export default async function NewIngredientPage({
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

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, company_id")
    .in("company_id", accessibleIds)
    .order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">New Ingredient</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <IngredientForm companies={selectable} defaultCompanyId={defaultCompanyId} suppliers={suppliers ?? []} />
      </div>
    </div>
  );
}
