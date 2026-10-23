import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmployeeForm } from "@/components/hr/EmployeeForm";
import { canManageStaffPrivateDetails } from "@/lib/hr/constants";
import { getHrAccess } from "@/lib/hr/access";

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
  if (!(await getHrAccess(supabase, session, accessibleIds)).adminAnywhere) redirect("/hr");
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Add Employee</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">Manual entry — bulk import is available from the Employee Database page.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <EmployeeForm companies={selectable} defaultCompanyId={defaultCompanyId} canEditPrivate={canManageStaffPrivateDetails(session.role)} />
      </div>
    </div>
  );
}
