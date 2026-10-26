import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getMenu } from "@/lib/kitchen/queries";
import { MENU_CATEGORY_LABEL } from "@/lib/kitchen/constants";
import { formatCurrency } from "@/lib/format";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { MenuActions } from "@/components/kitchen/KitchenRecordActions";

export default async function MenuDetailPage({
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

  let menu;
  try {
    menu = await getMenu(supabase, id);
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/kitchen/menus${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Menus
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{menu.name}</div>
          <div className="text-[13px] text-text-secondary">
            {menu.companies?.name}
            {menu.description && ` · ${menu.description}`}
          </div>
        </div>
        <MenuActions
          listHref={`/kitchen/menus${query}`}
          menu={{ id, name: menu.name, description: menu.description ?? "", items: menu.menu_items.map((i) => ({ name: i.name, category: i.category, pricePerPax: i.price_per_pax === null ? "" : String(i.price_per_pax) })) }}
        />
      </div>

      <SectionCard title="Menu Items" action={<Link href={`/kitchen/recipes/new${query}`} className="text-[12.5px] font-semibold text-primary">+ New Recipe for an Item</Link>}>
        {menu.menu_items.length === 0 ? (
          <EmptyRow text="No items in this menu yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {menu.menu_items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <span className="font-semibold text-text">{item.name}</span>
                  <span className="ml-2 text-text-muted">{MENU_CATEGORY_LABEL[item.category] ?? item.category}</span>
                </div>
                <div className="text-text-secondary">{item.price_per_pax != null ? formatCurrency(Number(item.price_per_pax)) + " / pax" : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
