import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getRecipe } from "@/lib/kitchen/queries";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { RecipeDeleteButton } from "@/components/kitchen/RecipeDeleteButton";
import { RecipePaxCalculator } from "@/components/kitchen/RecipePaxCalculator";
import { ApproveRecipeButton } from "@/components/kitchenPurchase/ApproveRecipeButton";

export default async function RecipeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();

  let recipe;
  try {
    recipe = await getRecipe(supabase, id);
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/kitchen/recipes${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Recipes
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{recipe.name}</div>
          <div className="text-[13px] text-text-secondary">
            {recipe.companies?.name} · Base yield {recipe.yield_pax} pax
            {recipe.menu_items?.name && ` · ${recipe.menu_items.name}`}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/kitchen/recipes/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Edit Recipe &amp; Ingredients
          </Link>
          <RecipeDeleteButton recipeId={recipe.id} recipeName={recipe.name} redirectTo={`/kitchen/recipes${query}`} />
        </div>
      </div>

      {(recipe as { status?: string }).status === "draft" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[13.5px] text-warning">
          <span>
            <b>Draft: not approved yet.</b> Check and edit the ingredients and steps, then approve it. A draft recipe is not used for purchase requests.
            {(recipe as { source_note?: string | null }).source_note && <span className="mt-1 block text-[12.5px]">{(recipe as { source_note?: string | null }).source_note}</span>}
          </span>
          <ApproveRecipeButton recipeId={recipe.id} />
        </div>
      )}

      {recipe.instructions && (
        <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Instructions</div>
          <p className="whitespace-pre-wrap">{recipe.instructions}</p>
        </div>
      )}

      <SectionCard title="Recipe + Pax Calculator">
        <RecipePaxCalculator recipeIngredients={recipe.recipe_ingredients} yieldPax={recipe.yield_pax} />
      </SectionCard>
    </div>
  );
}
