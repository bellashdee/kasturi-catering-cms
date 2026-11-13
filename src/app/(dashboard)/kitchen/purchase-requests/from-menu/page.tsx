import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { todayInMalaysia } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { PurchasePlanner } from "@/components/kitchen/PurchasePlanner";
import { listPlannerEvents, loadSupplierItemOptions } from "@/lib/purchasePlanner/data";
import { loadRecipeRefs } from "@/lib/kitchenAi/data";
import { loadSavedMatches } from "@/lib/purchasePlanner/matches";

/**
 * Purchase Request from the menu of an event: choose the event(s), the menu gives the ingredients and their quantities (from the
 * recipes), and the ingredients are ordered from the suppliers who sell them, at their latest price. One purchase order per supplier.
 */
export default async function PurchaseFromMenuPage({ searchParams }: { searchParams: Promise<{ company?: string; mode?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { company: requestedId, mode } = await searchParams;
  // "manual": the kitchen chooses the menus (recipes) and their pax itself; otherwise the menu comes from the event
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  if (selectable.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  // the purchase is made for one company at a time (its recipes, stock, suppliers and prices)
  const company = targetCompanyIds.length === 1 ? selectable.find((c) => c.id === targetCompanyIds[0]) : selectable.length === 1 ? selectable[0] : undefined;
  const query = company && requestedId ? `?company=${company.id}` : "";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/kitchen/purchase-requests${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Purchase Requests</Link>
        <h1 className="mt-1 text-[22px] font-extrabold text-text">New Purchase Request</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Choose the event, or key in the menu yourself. The ingredients and quantities are worked out from the recipes and the pax, then ordered from the suppliers.</p>
      </div>

      <KitchenSubNav />

      {!company ? (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="text-[14px] font-bold text-text">Which company is buying?</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectable.map((c) => (
              <Link key={c.id} href={`/kitchen/purchase-requests/from-menu?company=${c.id}${mode ? `&mode=${mode}` : ""}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface-alt">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <PurchasePlanner
          companyId={company.id}
          companyName={company.name}
          events={await listPlannerEvents(supabase, company.id, todayInMalaysia())}
          recipeOptions={await loadRecipeRefs(supabase, company.id)}
          supplierItems={await loadSupplierItemOptions(supabase, company.id)}
          savedMatches={Object.fromEntries(await loadSavedMatches(supabase, company.id))}
          query={query}
          initialMode={mode === "manual" ? "recipes" : "event"}
        />
      )}
    </div>
  );
}
