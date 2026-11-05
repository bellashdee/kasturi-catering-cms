import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { RequestPageBody } from "@/components/kitchenPurchase/RequestPageBody";

export default async function PurchaserKitchenRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-extrabold text-text">Supplier &amp; Procurement</h1>
      <SupplierProcurementSubNav />
      <RequestPageBody id={id} backHref="/supplier-procurement/kitchen-requests" backLabel="Back to Incoming Purchase Requests" />
    </div>
  );
}
