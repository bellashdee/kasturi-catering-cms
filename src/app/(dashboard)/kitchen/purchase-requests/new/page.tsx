import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { PurchaseRequestForm } from "@/components/kitchen/PurchaseRequestForm";

export default async function NewPurchaseRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; ingredient?: string; qty?: string; productionOrder?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, ingredient, qty, productionOrder } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;
  const query = requestedId ? `?company=${requestedId}` : "";

  const [{ data: ingredients }, { data: suppliers }] = await Promise.all([
    supabase.from("ingredients").select("id, name, unit_of_measure, company_id, preferred_supplier_id").in("company_id", accessibleIds).order("name"),
    supabase.from("suppliers").select("id, name, company_id").in("company_id", accessibleIds).order("name"),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">New Purchase Request</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <PurchaseRequestForm
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          ingredients={ingredients ?? []}
          suppliers={suppliers ?? []}
          defaultIngredientId={ingredient}
          defaultQuantity={qty}
          productionOrderId={productionOrder}
          redirectTo={`/kitchen/purchase-requests${query}`}
        />
      </div>
    </div>
  );
}
