import { redirect } from "next/navigation";

/** The Purchase Requests list is part of the Purchase Orders page now. */
export default async function ProcurementRequestsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  redirect(`/supplier-procurement/orders${company ? `?company=${company}` : ""}`);
}
