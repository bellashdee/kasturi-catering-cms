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

  const itemsByMeal = new Map<string, { item_name: string; sort_order: number }[]>();
  for (const item of pkg.package_menu_items) {
    const list = itemsByMeal.get(item.meal_type) ?? [];
    list.push(item);
    itemsByMeal.set(item.meal_type, list);
  }

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
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Price per Pax</div>
          <div className="mt-1 text-xl font-extrabold text-text">{packagePriceLabel(pkg.price_per_pax)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Minimum Pax</div>
          <div className="mt-1 text-xl font-extrabold text-text">{pkg.minimum_pax}</div>
        </div>
      </div>

      <SectionCard title="Menu Items">
        {itemsByMeal.size === 0 ? (
          <p className="text-[13px] text-text-muted">No items added.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {Object.keys(PACKAGE_MEAL_TYPE_LABEL)
              .filter((meal) => itemsByMeal.has(meal))
              .map((meal) => (
                <div key={meal}>
                  <div className="text-[12.5px] font-bold text-text">{PACKAGE_MEAL_TYPE_LABEL[meal]}</div>
                  <ul className="mt-1 list-disc pl-5 text-[13.5px] text-text-secondary">
                    {itemsByMeal.get(meal)!.map((item, idx) => <li key={idx}>{item.item_name}</li>)}
                  </ul>
                </div>
              ))}
          </div>
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
