import { getRestaurantContext } from "@/lib/restaurant/access";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { ImportFeedMe } from "@/components/restaurant/ImportFeedMe";

export default async function ImportFeedMePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Import FeedMe Sales</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{ctx.company.name} · the Excel file of FeedMe, Report → Overview</p>
      </div>
      <RestaurantSubNav isAdmin={ctx.can.roles} />
      <ImportFeedMe companyId={ctx.company.id} canSell={ctx.can.sell} />
    </div>
  );
}
