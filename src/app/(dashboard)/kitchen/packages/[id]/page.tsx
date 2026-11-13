import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getPackageMenu } from "@/lib/kitchen/packages/queries";
import { PACKAGE_MEAL_TYPE_LABEL } from "@/lib/kitchen/constants";
import { packagePriceLabel } from "@/lib/kitchen/packages/format";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PackageActiveToggle } from "@/components/kitchen/PackageActiveToggle";
import { PackageActions } from "@/components/kitchen/PackageRecordActions";
import { PackageMenuPicker, type PackageDish } from "@/components/kitchen/PackageMenuPicker";
import { menuChoices, sideOf } from "@/lib/kitchen/side";
import { loadRecipeData, loadRecipeRefs } from "@/lib/kitchenAi/data";
import { autoMatch, candidatesFor } from "@/lib/kitchenAi/match";

export default async function PackageMenuDetailPage({
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

  let pkg;
  try {
    pkg = await getPackageMenu(supabase, id);
  } catch {
    notFound();
  }

  // a fixed daily menu (Signature Solution: JDT 2 / 3 / 4 / UTM) has no price: its recipes are for this many pax
  const menuSet = (pkg as { menu_set?: string | null }).menu_set ?? null;
  const itemsByMeal = new Map<string, { item_name: string; sort_order: number; recipe_id?: string | null }[]>();
  for (const item of pkg.package_menu_items) {
    const list = itemsByMeal.get(item.meal_type) ?? [];
    list.push(item);
    itemsByMeal.set(item.meal_type, list);
  }

  // every choice of every line is one menu item (a line "A / B / C" is three items), with the recipe that clearly fits it
  const refs = await loadRecipeRefs(supabase, pkg.company_id);
  const dishes: PackageDish[] = [];
  for (const meal of Object.keys(PACKAGE_MEAL_TYPE_LABEL).filter((m) => itemsByMeal.has(m))) {
    itemsByMeal.get(meal)!.forEach((item, li) => {
      menuChoices(item.item_name).forEach((c, ci) => {
        // a dish loaded from a menu file keeps its exact recipe (several recipes can share the dish name); otherwise the closest match
        const best = item.recipe_id ?? autoMatch(c.name, refs)?.recipeId ?? null;
        const candidates = candidatesFor(c.name, refs);
        const fixed = item.recipe_id && !candidates.some((x) => x.recipeId === item.recipe_id) ? refs.filter((r) => r.id === item.recipe_id).map((r) => ({ recipeId: r.id, name: r.name, score: 1 })) : [];
        dishes.push({ id: `${meal}:${li}:${ci}`, mealLabel: PACKAGE_MEAL_TYPE_LABEL[meal], section: c.section, name: c.name, side: sideOf(c.name, c.section), recipeId: best, candidates: [...fixed, ...candidates] as typeof candidates });
      });
    });
  }
  const recipeIds = Array.from(new Set(dishes.flatMap((d) => [...(d.recipeId ? [d.recipeId] : []), ...d.candidates.map((x) => x.recipeId)])));
  const recipeData = Array.from((await loadRecipeData(supabase, recipeIds)).values());

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/kitchen/packages${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Package Menu
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{pkg.name}</div>
          <div className="text-[13px] text-text-secondary">{pkg.companies?.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={pkg.is_active ? "success" : "warning"}>{pkg.is_active ? "Active" : "Inactive"}</StatusBadge>
          <PackageActiveToggle packageId={pkg.id} isActive={pkg.is_active} />
          <PackageActions
            listHref={`/kitchen/packages${query}`}
            pkg={{
              id: pkg.id,
              name: pkg.name,
              pricePerPax: String(pkg.price_per_pax),
              minimumPax: String(pkg.minimum_pax ?? 0),
              includedItems: pkg.included_items ?? "",
              specialRequirements: pkg.special_requirements ?? "",
              items: [...pkg.package_menu_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ mealType: i.meal_type, itemName: i.item_name })),
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{menuSet ? "Menu" : "Price per pax"}</div>
          <div className="mt-1 text-xl font-extrabold text-text">{menuSet ?? packagePriceLabel(pkg.price_per_pax)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{menuSet ? "Recipe pax" : "Minimum pax"}</div>
          <div className="mt-1 text-xl font-extrabold text-text">{pkg.minimum_pax}{menuSet ? " pax" : ""}</div>
        </div>
      </div>

      <SectionCard title="Menu Items">
        {dishes.length === 0 ? (
          <p className="text-[13px] text-text-muted">No items added.</p>
        ) : (
          <PackageMenuPicker dishes={dishes} recipeData={recipeData} recipeRefs={refs} minimumPax={pkg.minimum_pax ?? 1} companyId={pkg.company_id} />
        )}
      </SectionCard>

      {pkg.included_items && (
        <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Included Items</div>
          {pkg.included_items}
        </div>
      )}

      {pkg.special_requirements && (
        <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Special Requirements</div>
          {pkg.special_requirements}
        </div>
      )}
    </div>
  );
}
