import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { RequestPageBody } from "@/components/kitchenPurchase/RequestPageBody";

export default async function KitchenPurchaseRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
      <KitchenSubNav />
      <RequestPageBody id={id} backHref="/kitchen/purchase-requests" backLabel="Back to Purchase Requests" />
    </div>
  );
}
