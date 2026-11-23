import Link from "next/link";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { fetchMenuItems } from "@/lib/restaurant/menuData";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { MatchFeedMe } from "@/components/restaurant/MatchFeedMe";

export default async function MatchFeedMePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;
  const items = await fetchMenuItems(ctx.db, ctx.company.id);
  const unlinked = items.filter((i) => i.is_active && !i.feedme_name).map((i) => ({ id: i.id, name: i.name, code: i.code }));
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Match the menu with FeedMe</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{ctx.company.name} · <Link href={`/restaurant/menu${ctx.query}`} className="text-primary hover:underline">Back to the menu</Link></p>
      </div>
      <RestaurantSubNav isAdmin={ctx.can.roles} />
      <MatchFeedMe companyId={ctx.company.id} unlinked={unlinked} canEdit={ctx.can.menu} />
    </div>
  );
}
