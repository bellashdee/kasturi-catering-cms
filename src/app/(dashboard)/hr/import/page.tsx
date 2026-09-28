import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { ImportEmployeesFlow } from "@/components/hr/ImportEmployeesFlow";

export default async function ImportEmployeesPage({
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
    <div className="mx-auto max-w-4xl">
      <h1 className="text-[22px] font-extrabold text-text">Import Employees</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">
        Upload an Excel or CSV file, check every row, then confirm — nothing is saved until you do.
      </p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <ImportEmployeesFlow companies={selectable} defaultCompanyId={defaultCompanyId} />
      </div>
    </div>
  );
}
