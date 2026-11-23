import Link from "next/link";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { fetchCategories } from "@/lib/restaurant/menuData";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { MenuItemForm } from "@/components/restaurant/MenuItemForm";

export default async function NewMenuItemPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;
  const categories = await fetchCategories(ctx.db, ctx.company.id);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">New menu item</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{ctx.company.name} · <Link href={`/restaurant/menu${ctx.query}`} className="text-primary hover:underline">Back to the menu</Link></p>
      </div>
      <RestaurantSubNav isAdmin={ctx.can.roles} />
      {ctx.can.menu ? (
        <MenuItemForm companyId={ctx.company.id} categories={categories} canEdit canPrice={ctx.can.manage} query={ctx.query} />
      ) : (
        <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-[13px] text-text-muted">Only a Chef, a Manager or an Admin can add a menu item.</div>
      )}
    </div>
  );
}
