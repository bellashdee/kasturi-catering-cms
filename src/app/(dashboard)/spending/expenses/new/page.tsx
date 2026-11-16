import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPaymentAccounts } from "@/lib/finance/paymentQueries";
import { CompanyExpenseUploadReview } from "@/components/finance/CompanyExpenseUploadReview";
import { SPENDING_CATEGORIES } from "@/lib/finance/spendingCategories";

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

  // the utility accounts (water, electricity ...) of each branch, to attach an account number to a utilities expense
  const utilityAccounts = (await listPaymentAccounts(supabase, accessibleIds, "utility").catch(() => [])).map((a) => ({
    id: a.id,
    companyId: a.company_id,
    name: a.name,
    provider: a.provider,
    accountNo: a.account_no,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold text-text">New Company Expense</h1>
      <p className="mt-1 text-[13px] text-text-secondary">Key it in yourself, or upload the receipt or invoice and let the AI read it. Check every field before you save.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <CompanyExpenseUploadReview
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          categories={SPENDING_CATEGORIES.map((name) => ({ id: name, name }))}
          utilityAccounts={utilityAccounts}
          redirectTo={`/spending/expenses${query}`}
        />
      </div>
    </div>
  );
}
