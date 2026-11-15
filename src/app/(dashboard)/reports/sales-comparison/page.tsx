import { redirect } from "next/navigation";

/** "Sales: this year vs last year" is now a block of the Performance Dashboard (Business Overview, whole year); old links open it there. */
export default async function SalesComparisonRedirect({ searchParams }: { searchParams: Promise<{ company?: string; year?: string }> }) {
  const { company, year } = await searchParams;
  const params = new URLSearchParams();
  if (company) params.set("company", company);
  if (year) params.set("year", year);
  const q = params.toString();
  redirect(`/reports/performance${q ? `?${q}` : ""}`);
}
