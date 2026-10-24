import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { IngredientMatching } from "@/components/procurement/IngredientMatching";
import { loadSupplierItemOptions } from "@/lib/purchasePlanner/data";
import { loadSavedMatchRows } from "@/lib/purchasePlanner/matches";
import { optionKey } from "@/lib/purchasePlanner/shared";

const PAGE = 1000;

/** The ingredient names of the company's recipes (one line each, A to Z). */
async function listRecipeIngredientNames(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string): Promise<string[]> {
  const names = new Map<string, string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from("recipe_ingredients").select("ingredients(name), recipes!inner(company_id)").eq("recipes.company_id", companyId).range(offset, offset + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      const n = r.ingredients?.name?.trim();
      if (n && !names.has(n.toUpperCase())) names.set(n.toUpperCase(), n);
    }
    if ((data ?? []).length < PAGE) break;
  }
  return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
}

/**
 * Ingredient matching: for every ingredient of the recipes, which supplier item it is bought as. The suggestions come from the names;
 * a person confirms or changes them, and the purchase lists (Kitchen, AI Assistant) start from what is saved here.
 */
export default async function IngredientMatchingPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { company: requestedId } = await searchParams;
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  if (selectable.length === 0) return <EmptyRow text="You don't have access to any company yet." />;
  const company = targetCompanyIds.length === 1 ? selectable.find((c) => c.id === targetCompanyIds[0]) : selectable.length === 1 ? selectable[0] : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Supplier &amp; Procurement</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Ingredient matching: which supplier item each ingredient of the recipes is bought as. The purchase lists start from what is saved here.</p>
      </div>
      <SupplierProcurementSubNav />

      {!company ? (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="text-[14px] font-bold text-text">Which company?</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectable.map((c) => (
              <Link key={c.id} href={`/supplier-procurement/ingredient-matching?company=${c.id}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface-alt">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        await (async () => {
          const [ingredients, items, rows] = await Promise.all([listRecipeIngredientNames(supabase, company.id), loadSupplierItemOptions(supabase, company.id), loadSavedMatchRows(supabase, company.id)]);
          if (ingredients.length === 0 || items.length === 0) {
            return <EmptyRow text={ingredients.length === 0 ? `${company.name} has no recipe ingredients yet.` : `${company.name} has no supplier purchase listing yet, so there are no supplier items to match.`} />;
          }
          return (
            <IngredientMatching
              companyId={company.id}
              ingredients={ingredients}
              items={items}
              savedRows={rows.map((r) => ({ ingredientKey: r.ingredientKey, optionKey: optionKey(r.supplierId, r.description, r.uom) }))}
            />
          );
        })()
      )}
    </div>
  );
}
