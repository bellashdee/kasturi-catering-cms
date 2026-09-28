import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { DriverForm } from "@/components/driver/DriverForm";

export default async function NewDriverPage({
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

  const { data: existingDrivers } = await supabase.from("driver_profiles").select("employee_id").in("company_id", accessibleIds);
  const existingDriverEmployeeIds = new Set((existingDrivers ?? []).map((d) => d.employee_id));

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, company_id")
    .in("company_id", accessibleIds)
    .eq("status", "active")
    .order("full_name");

  const availableEmployees = (employees ?? []).filter((e) => !existingDriverEmployeeIds.has(e.id));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">New Driver</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <DriverForm companies={selectable} defaultCompanyId={defaultCompanyId} employees={availableEmployees} />
      </div>
    </div>
  );
}
