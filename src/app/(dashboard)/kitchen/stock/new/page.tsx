import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { StockUploadReview } from "@/components/kitchen/StockUploadReview";

export default async function NewStockEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;
  const query = requestedId ? `?company=${requestedId}` : "";

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, unit_of_measure, company_id")
    .in("company_id", accessibleIds)
    .order("name");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold text-text">New Stock Entry</h1>
      <p className="mt-1 text-[13px] text-text-secondary">Enter stock changes manually, or upload a stock count photo or a supplier receipt for AI to read.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <StockUploadReview companies={selectable} defaultCompanyId={defaultCompanyId} ingredients={ingredients ?? []} redirectTo={`/kitchen/stock${query}`} />
      </div>
    </div>
  );
}
