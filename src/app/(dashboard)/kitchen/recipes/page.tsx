import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listRecipes } from "@/lib/kitchen/queries";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { RECIPE_CATEGORIES, recipeCategory } from "@/lib/kitchen/recipeCategory";
import { SIDE_LABEL, sideOf, type KitchenSide } from "@/lib/kitchen/side";
import { ApproveDraftsButton } from "@/components/kitchenPurchase/ApproveRecipeButton";
import { kitchenPlanAccess } from "@/lib/kitchenPlan/access";
import { Select } from "@/components/ui/Select";

/** The fixed menu sets of Signature Solution (from its menu files); a recipe can be in more than one. */
const MENU_SETS = ["JDT 2", "JDT 3", "JDT 4", "JDT UTM"];
const setsOf = (r: unknown) => ((r as { menu_sets?: string[] }).menu_sets ?? []);

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; category?: string; q?: string; side?: string; status?: string; set?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, category: categoryParam, q, side: sideParam, status: statusParam, set: setParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const everyRecipe = await listRecipes(supabase, targetCompanyIds);
  const isDraft = (r: unknown) => (r as { status?: string }).status === "draft";
  const draftCount = everyRecipe.filter(isDraft).length;
  const draftsOnly = statusParam === "draft";
  const allRecipes = draftsOnly ? everyRecipe.filter(isDraft) : everyRecipe;
  const canApprove = draftsOnly ? (await kitchenPlanAccess(session)).canPlan : false;
  const search = q?.trim().toLowerCase();
  const activeSide: KitchenSide | undefined = sideParam === "kitchen" || sideParam === "bar" ? sideParam : undefined;
  const hasSets = everyRecipe.some((r) => setsOf(r).length > 0);
  const activeSet = MENU_SETS.includes(setParam ?? "") ? setParam : undefined;
  const bySet = activeSet ? allRecipes.filter((r) => setsOf(r).includes(activeSet)) : allRecipes;
  const bySearch = search ? bySet.filter((r) => r.name.toLowerCase().includes(search)) : bySet;
  const sideCounts = { kitchen: bySearch.filter((r) => sideOf(r.name) === "kitchen").length, bar: bySearch.filter((r) => sideOf(r.name) === "bar").length };
  const matching = activeSide ? bySearch.filter((r) => sideOf(r.name) === activeSide) : bySearch;
  const counts = Object.fromEntries(RECIPE_CATEGORIES.map((c) => [c.key, matching.filter((r) => recipeCategory(r.name) === c.key).length]));
  const activeCategory = RECIPE_CATEGORIES.some((c) => c.key === categoryParam) ? categoryParam : undefined;
  const recipes = activeCategory ? matching.filter((r) => recipeCategory(r.name) === activeCategory) : matching;
  const sections = RECIPE_CATEGORIES.map((c) => ({ ...c, items: recipes.filter((r) => recipeCategory(r.name) === c.key) })).filter((s) => s.items.length > 0);
  const filtered = !!(activeCategory || search || activeSet || activeSide || draftsOnly);
  const showCompany = targetCompanyIds.length > 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {recipes.length} recipe{recipes.length === 1 ? "" : "s"}
            {filtered && ` (of ${everyRecipe.length})`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`/kitchen/recipes/suggest${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            + Recipe from Google reference
          </Link>
          <Link href={`/kitchen/recipes/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Recipe
          </Link>
        </div>
      </div>

      <KitchenSubNav />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        {requestedId && <input type="hidden" name="company" value={requestedId} />}
        <label className="min-w-[14rem] flex-1 text-[12px] font-semibold text-text-secondary">
          Search
          <input name="q" defaultValue={q ?? ""} placeholder="Recipe name" className="mt-1 block h-9 w-full rounded-lg border border-border-strong px-3 text-[13px] outline-none focus:border-primary" />
        </label>
        {hasSets && (
          <label className="text-[12px] font-semibold text-text-secondary">
            Menu
            <Select name="set" defaultValue={activeSet ?? ""} className="mt-1 block h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
              <option value="">All menus</option>
              {MENU_SETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </label>
        )}
        <label className="text-[12px] font-semibold text-text-secondary">
          Category
          <Select name="category" defaultValue={activeCategory ?? ""} className="mt-1 block h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All categories</option>
            {RECIPE_CATEGORIES.filter((c) => counts[c.key] > 0 || c.key === activeCategory).map((c) => <option key={c.key} value={c.key}>{`${c.label} (${counts[c.key]})`}</option>)}
          </Select>
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Side
          <Select name="side" defaultValue={activeSide ?? ""} className="mt-1 block h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">Kitchen &amp; bar</option>
            {(["kitchen", "bar"] as const).map((k) => <option key={k} value={k}>{`${SIDE_LABEL[k]} (${sideCounts[k]})`}</option>)}
          </Select>
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Status
          <Select name="status" defaultValue={draftsOnly ? "draft" : ""} className="mt-1 block h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All recipes</option>
            <option value="draft">{`Drafts to review (${draftCount})`}</option>
          </Select>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply</button>
        {filtered && (
          <Link href={`/kitchen/recipes${query}`} className="flex h-9 items-center rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text">
            Clear
          </Link>
        )}
      </form>

      {draftsOnly && canApprove && recipes.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[13.5px] text-warning">
          <p className="mb-2">These recipes were filled in from a reference and are not approved yet, so they are not used for purchase requests. Open each recipe to check it, then approve the ones shown here.</p>
          <ApproveDraftsButton ids={recipes.map((r) => r.id)} />
        </div>
      )}

      <div className="flex flex-col gap-5">
        {recipes.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface shadow-sm">
            <EmptyRow text={everyRecipe.length === 0 ? "No recipes yet. Add one to work out the ingredients from the pax." : "No recipe matches these filters."} />
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.key} className="rounded-xl border border-border bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="text-[15px] font-extrabold text-text">{section.label}</div>
                <div className="text-xs font-semibold text-text-muted">{section.items.length} recipe{section.items.length === 1 ? "" : "s"}</div>
              </div>
              <div className="grid grid-cols-[1.8fr_0.7fr_0.7fr_1.2fr] border-b border-border bg-surface-alt px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <div>Recipe</div>
                <div>Base pax</div>
                <div>Ingredients</div>
                <div>{showCompany ? "Company · Menu" : "Menu"}</div>
              </div>
              {section.items.map((r) => (
                <Link
                  key={r.id}
                  href={`/kitchen/recipes/${r.id}${query}`}
                  className="grid grid-cols-[1.8fr_0.7fr_0.7fr_1.2fr] items-center border-b border-border px-5 py-3 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">
                    {r.name}
                    {(r as { status?: string }).status === "draft" && <span className="ml-2 rounded bg-warning-bg px-1.5 py-0.5 text-[10.5px] font-bold text-warning">Draft</span>}
                    {(r.recipe_ingredients?.[0]?.count ?? 0) === 0 && <span className="ml-2 rounded bg-warning-bg px-1.5 py-0.5 text-[10.5px] font-bold text-warning">No ingredients</span>}
                  </div>
                  <div className="text-text-secondary">{Number(r.yield_pax)} pax</div>
                  <div className="text-text-secondary">{r.recipe_ingredients?.[0]?.count ?? 0}</div>
                  <div className="flex flex-wrap items-center gap-1 text-text-secondary">
                    {showCompany && <span className="mr-1">{r.companies?.name}</span>}
                    {setsOf(r).map((m) => <span key={m} className="rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info">{m}</span>)}
                    {!showCompany && setsOf(r).length === 0 && <span className="text-text-muted">—</span>}
                  </div>
                </Link>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
