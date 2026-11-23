import { getRestaurantContext } from "@/lib/restaurant/access";
import { fetchIngredients } from "@/lib/restaurant/menuData";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { IngredientsManager } from "@/components/restaurant/IngredientsManager";
import { canAccessModule } from "@/lib/modules";

export default async function IngredientsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;
  const ingredients = await fetchIngredients(ctx.db, ctx.company.id);
  // the supplier prices are in Supplier & Procurement: a suggestion is offered to the people who may open it
  const canSuggest = canAccessModule(ctx.session.allowedModules, "supplier-procurement");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Ingredients (costing list)</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{ctx.company.name} · the price of each ingredient for the recipes. This list does not change the Stock.</p>
      </div>
      <RestaurantSubNav isAdmin={ctx.can.roles} />
      <IngredientsManager companyId={ctx.company.id} ingredients={ingredients} canEdit={ctx.can.costing} canSuggest={canSuggest && ctx.can.costing} />
    </div>
  );
}
