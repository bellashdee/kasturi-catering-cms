import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listRecipes } from "@/lib/kitchen/queries";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { RECIPE_CATEGORIES, recipeCategory } from "@/lib/kitchen/recipeCategory";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; category?: string; q?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, category: categoryParam, q } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const allRecipes = await listRecipes(supabase, targetCompanyIds);
  const search = q?.trim().toLowerCase();
  const matching = search ? allRecipes.filter((r) => r.name.toLowerCase().includes(search)) : allRecipes;
  const counts = Object.fromEntries(RECIPE_CATEGORIES.map((c) => [c.key, matching.filter((r) => recipeCategory(r.name) === c.key).length]));
  const activeCategory = RECIPE_CATEGORIES.some((c) => c.key === categoryParam) ? categoryParam : undefined;
  const recipes = activeCategory ? matching.filter((r) => recipeCategory(r.name) === activeCategory) : matching;
  const sections = RECIPE_CATEGORIES.map((c) => ({ ...c, items: recipes.filter((r) => recipeCategory(r.name) === c.key) })).filter((s) => s.items.length > 0);
  const link = (category?: string) => {
    const params = new URLSearchParams();
    if (requestedId) params.set("company", requestedId);
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    const qs = params.toString();
    return `/kitchen/recipes${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {recipes.length} recipe{recipes.length === 1 ? "" : "s"}
            {(activeCategory || search) && ` (of ${allRecipes.length})`}
          </p>
        </div>
        <Link href={`/kitchen/recipes/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Recipe
        </Link>
      </div>

      <KitchenSubNav />

      <form method="get" className="flex flex-wrap items-center gap-2">
        {requestedId && <input type="hidden" name="company" value={requestedId} />}
        {activeCategory && <input type="hidden" name="category" value={activeCategory} />}
        <input name="q" defaultValue={q ?? ""} placeholder="Search recipe name" className="h-9 w-64 rounded-lg border border-border-strong px-3 text-[13px] outline-none focus:border-primary" />
        <button type="submit" className="h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text">Search</button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Link href={link()} className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${!activeCategory ? "border-primary bg-info-bg text-primary" : "border-border-strong text-text-secondary hover:bg-surface-alt"}`}>
          All ({matching.length})
        </Link>
        {RECIPE_CATEGORIES.filter((c) => counts[c.key] > 0 || c.key === activeCategory).map((c) => (
          <Link key={c.key} href={link(c.key)} className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${activeCategory === c.key ? "border-primary bg-info-bg text-primary" : "border-border-strong text-text-secondary hover:bg-surface-alt"}`}>
            {c.label} ({counts[c.key]})
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        {recipes.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface shadow-sm">
            <EmptyRow text={allRecipes.length === 0 ? "No recipes yet. Create one to enable Recipe + Pax ingredient calculations." : "No recipe matches the search or category."} />
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.key} className="rounded-xl border border-border bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="text-[15px] font-extrabold text-text">{section.label}</div>
                <div className="text-xs font-semibold text-text-muted">{section.items.length} recipe{section.items.length === 1 ? "" : "s"}</div>
              </div>
              <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_1fr] border-b border-border bg-surface-alt px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <div>Recipe</div>
                <div>Base Yield</div>
                <div>Ingredients</div>
                <div>Company</div>
              </div>
              {section.items.map((r) => (
                <Link
                  key={r.id}
                  href={`/kitchen/recipes/${r.id}${query}`}
                  className="grid grid-cols-[1.6fr_0.8fr_0.8fr_1fr] border-b border-border px-5 py-3 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">
                    {r.name}
                    {(r.recipe_ingredients?.length ?? 0) === 0 && <span className="ml-2 rounded bg-warning-bg px-1.5 py-0.5 text-[10.5px] font-bold text-warning">No ingredients yet</span>}
                  </div>
                  <div className="text-text-secondary">{r.yield_pax} pax</div>
                  <div className="text-text-secondary">{r.recipe_ingredients?.length ?? 0}</div>
                  <div className="text-text-secondary">{r.companies?.name}</div>
                </Link>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
