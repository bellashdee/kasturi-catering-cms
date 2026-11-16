import { redirect } from "next/navigation";

/** Procurement Payments is removed: suppliers are paid from Admin & Finance → Supplier, Rental & Utilities → Supplier Payment. Old links and bookmarks go there. */
export default async function SupplierPaymentsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  redirect(company ? `/finance/supplier-payment?company=${encodeURIComponent(company)}` : "/finance/supplier-payment");
}
