import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { CustomerForm } from "@/components/marketing/CustomerForm";

export default async function NewCustomerPage({
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

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-[22px] font-extrabold text-text">Add Customer</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <CustomerForm companies={selectable} defaultCompanyId={defaultCompanyId} />
      </div>
    </div>
  );
}
