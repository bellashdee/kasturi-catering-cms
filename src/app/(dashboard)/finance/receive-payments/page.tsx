import { redirect } from "next/navigation";

/** Receive Payment (PDF) is now part of Payments Received (the Payment Proofs page): old links and bookmarks go there. */
export default async function ReceivePaymentsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  redirect(company ? `/finance/payment-proofs?company=${encodeURIComponent(company)}` : "/finance/payment-proofs");
}
