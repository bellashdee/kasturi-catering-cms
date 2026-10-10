import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { hrAdminCompanyIds } from "@/lib/hr/permissions";
import { listDepartments } from "@/lib/hr/queries";
import { EmployeeForm } from "@/components/hr/EmployeeForm";
import { EmptyRow } from "@/components/dashboard/SectionCard";

export default async function NewEmployeePage({
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
  const hrIds = await hrAdminCompanyIds(supabase, accessibleIds);
  if (hrIds.length === 0) return <EmptyRow text="Only an HR Admin can add employees." />;

  const selectable = companies.filter((c) => hrIds.includes(c.id));
  const defaultCompanyId = requestedId && hrIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  const [departments, { data: managers }] = await Promise.all([
    listDepartments(supabase, hrIds),
    supabase.from("employees").select("id, company_id, full_name").in("company_id", hrIds).eq("status", "active").order("full_name"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold text-text">Add Employee</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">Manual entry — bulk import is available from the Employee Directory page.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <EmployeeForm companies={selectable} departments={departments} managers={managers ?? []} defaultCompanyId={defaultCompanyId} />
      </div>
    </div>
  );
}
