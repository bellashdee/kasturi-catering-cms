import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getRecipe } from "@/lib/kitchen/queries";
import { RecipeForm } from "@/components/kitchen/RecipeForm";

export default async function EditRecipePage({
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

  const [{ data: menuItems }, { data: ingredients }] = await Promise.all([
    supabase.from("menu_items").select("id, name, company_id").eq("company_id", recipe.company_id).order("name"),
    supabase.from("ingredients").select("id, name, unit_of_measure, company_id").eq("company_id", recipe.company_id).order("name"),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/kitchen/recipes/${id}${query}`} className="text-[12.5px] font-semibold text-text-secondary">
        ← Back to {recipe.name}
      </Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Edit Recipe</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <RecipeForm
          companies={[{ id: recipe.company_id, name: recipe.companies?.name ?? "" }]}
          menuItems={menuItems ?? []}
          ingredients={ingredients ?? []}
          initial={{
            id: recipe.id,
            companyId: recipe.company_id,
            menuItemId: recipe.menu_item_id ?? "",
            name: recipe.name,
            yieldPax: Number(recipe.yield_pax),
            instructions: recipe.instructions ?? "",
            lines: recipe.recipe_ingredients.map((l) => ({
              id: l.id,
              ingredientId: l.ingredient_id,
              quantityPerYield: Number(l.quantity_per_yield),
              unit: l.unit ?? "",
            })),
          }}
        />
      </div>
    </div>
  );
}
