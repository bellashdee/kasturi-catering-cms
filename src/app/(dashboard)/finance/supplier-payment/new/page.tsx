import { PaymentNewPage } from "@/components/finance/PaymentNewPage";

export default function Page({ searchParams }: { searchParams: Promise<{ company?: string; year?: string; month?: string; account?: string }> }) {
  return <PaymentNewPage category="supplier" searchParams={searchParams} />;
}
