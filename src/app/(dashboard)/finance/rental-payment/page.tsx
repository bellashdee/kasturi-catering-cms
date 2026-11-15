import { PaymentListPage } from "@/components/finance/PaymentListPage";

export default function Page({ searchParams }: { searchParams: Promise<{ company?: string; year?: string; month?: string; status?: string; payee?: string; provider?: string; saved?: string; sort?: string; dir?: string }> }) {
  return <PaymentListPage category="rental" searchParams={searchParams} />;
}
