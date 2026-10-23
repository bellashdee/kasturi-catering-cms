import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { DriverExpenseUploadReview } from "@/components/driver/DriverExpenseUploadReview";

export default async function NewDriverExpensePage({
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

  const { data: employees } = await supabase.from("employees").select("id, full_name, company_id").in("company_id", accessibleIds).eq("status", "active").order("full_name");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold text-text">New Expense</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">For receipts and invoices paid directly by the Director of Finance.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <DriverExpenseUploadReview
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          employees={employees ?? []}
          redirectTo={`/driver-logistics/expenses${query}`}
        />
      </div>
    </div>
  );
}
