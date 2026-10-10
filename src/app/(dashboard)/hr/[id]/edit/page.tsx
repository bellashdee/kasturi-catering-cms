import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEmployee, getEmployeePrivateDetails, listDepartments } from "@/lib/hr/queries";
import { getEmployeeViewer } from "@/lib/hr/permissions";
import { EmployeeForm } from "@/components/hr/EmployeeForm";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let employee;
  try {
    employee = await getEmployee(supabase, id);
  } catch {
    notFound();
  }

  const viewer = await getEmployeeViewer(supabase, employee);
  if (!viewer.isHr) return <EmptyRow text="Only an HR Admin of this company can edit employee records." />;

  const [{ data: company }, departments, { data: managers }, privateDetails, { data: isAdmin }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("id", employee.company_id).single(),
    listDepartments(supabase, [employee.company_id]),
    supabase.from("employees").select("id, company_id, full_name").eq("company_id", employee.company_id).eq("status", "active").order("full_name"),
    getEmployeePrivateDetails(supabase, id),
    supabase.rpc("user_is_company_admin", { target_company_id: employee.company_id }),
  ]);

  // Only an admin of this company links logins to staff records.
  let accounts: { id: string; label: string }[] | undefined;
  if (isAdmin === true) {
    const { data: profiles } = await createAdminClient().from("profiles").select("id, full_name, email, username").eq("is_active", true).order("full_name");
    accounts = (profiles ?? []).map((p) => ({ id: p.id, label: `${p.full_name} (${p.username || p.email})` }));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit {employee.full_name}</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <EmployeeForm
          employeeId={id}
          accounts={accounts}
          initialUserId={employee.user_id}
          companies={company ? [company] : []}
          departments={departments}
          managers={managers ?? []}
          initial={{
            companyId: employee.company_id,
            fullName: employee.full_name,
            employeeNo: employee.employee_no ?? "",
            departmentId: employee.department_id ?? "",
            position: employee.position ?? "",
            employmentType: employee.employment_type,
            joinDate: employee.join_date ?? "",
            probationStart: employee.probation_start ?? "",
            probationEnd: employee.probation_end ?? "",
            contractEnd: employee.contract_end ?? "",
            reportingManagerId: employee.reporting_manager_id ?? "",
            phone: employee.phone ?? "",
            email: employee.email ?? "",
            icPassportNo: privateDetails?.ic_passport_no ?? "",
            residentialAddress: privateDetails?.residential_address ?? "",
            emergencyContactName: privateDetails?.emergency_contact_name ?? "",
            emergencyContactRelationship: privateDetails?.emergency_contact_relationship ?? "",
            emergencyContactPhone: privateDetails?.emergency_contact_phone ?? "",
            bankName: privateDetails?.bank_name ?? "",
            bankAccountNo: privateDetails?.bank_account_no ?? "",
            epfNo: privateDetails?.epf_no ?? "",
          }}
        />
      </div>
    </div>
  );
}
