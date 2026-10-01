import { calculateQuantity, formatQuantity } from "@/lib/menuPlan/calc";

type DishIngredient = { id: string; name: string; base_quantity: number | null; base_pax: number; unit: string | null };

export function MenuPlanDishRequirements({ dishName, ingredients, targetPax }: { dishName: string; ingredients: DishIngredient[]; targetPax: number }) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-semibold text-text">{dishName}</div>
      {ingredients.length === 0 ? (
        <p className="text-[13px] text-text-muted">No ingredients recorded for this dish in the menu reference file.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {ingredients.map((ing) => (
            <div key={ing.id} className="flex items-center justify-between py-2 text-[13.5px]">
              <span className="text-text">{ing.name}</span>
              <span className="font-semibold text-text">
                {formatQuantity(calculateQuantity(ing.base_quantity, ing.base_pax, targetPax))} {ing.unit ?? ""}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-text-muted">
        From the real menu reference file, scaled to {targetPax} pax — reference only. This does not auto-deduct Kitchen stock; use a Purchase Request for anything you need to buy.
      </p>
    </div>
  );
}
