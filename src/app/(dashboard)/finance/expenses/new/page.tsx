import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCostCategories } from "@/lib/finance/queries";
import { CompanyExpenseUploadReview } from "@/components/finance/CompanyExpenseUploadReview";

export default async function NewCompanyExpensePage({
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

  const categories = await listCostCategories(supabase, accessibleIds);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold text-text">New Company Expense</h1>
      <p className="mt-1 text-[13px] text-text-secondary">Enter it manually, or upload a receipt/invoice for AI to read.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <CompanyExpenseUploadReview
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          categories={categories}
          redirectTo={`/finance/expenses${query}`}
        />
      </div>
    </div>
  );
}
