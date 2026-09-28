import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getIngredient } from "@/lib/kitchen/queries";
import { IngredientForm } from "@/components/kitchen/IngredientForm";

export default async function EditIngredientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let ingredient;
  try {
    ingredient = await getIngredient(supabase, id);
  } catch {
    notFound();
  }

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const { data: suppliers } = await supabase.from("suppliers").select("id, name, company_id").eq("company_id", ingredient.company_id).order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit Ingredient</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <IngredientForm
          companies={allCompanies ?? []}
          suppliers={suppliers ?? []}
          ingredientId={id}
          initial={{
            companyId: ingredient.company_id,
            name: ingredient.name,
            unitOfMeasure: ingredient.unit_of_measure ?? undefined,
            currentStockQty: Number(ingredient.current_stock_qty),
            reorderLevel: Number(ingredient.reorder_level),
            unitCost: Number(ingredient.unit_cost),
            preferredSupplierId: ingredient.preferred_supplier_id ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
