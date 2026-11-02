import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEmployee, getEmployeePrivateDetails } from "@/lib/hr/queries";
import { canManageStaffPrivateDetails } from "@/lib/hr/constants";
import { EmployeeForm } from "@/components/hr/EmployeeForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHrAccess } from "@/lib/hr/access";

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
  const access = await getHrAccess(supabase, session, [employee.company_id]);
  if (!access.isAdminOf(employee.company_id)) notFound();

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  // the companies where this person (same name) already has a staff record
  const { data: sameName } = await supabase.from("employees").select("company_id, full_name");
  const nameKey = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
  const attachedCompanyIds = (sameName ?? []).filter((e) => nameKey(e.full_name) === nameKey(employee.full_name)).map((e) => e.company_id);
  const canEditPrivate = canManageStaffPrivateDetails(session.role);
  const privateDetails = canEditPrivate ? await getEmployeePrivateDetails(supabase, id) : null;

  // Only an admin of this company links logins to staff records.
  const { data: isAdmin } = await supabase.rpc("user_is_company_admin", { target_company_id: employee.company_id });
  let accounts: { id: string; label: string }[] | undefined;
  if (isAdmin === true) {
    const { data: profiles } = await createAdminClient().from("profiles").select("id, full_name, email, username").eq("is_active", true).order("full_name");
    accounts = (profiles ?? []).map((p) => ({ id: p.id, label: `${p.full_name} (${p.username || p.email})` }));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit {employee.full_name}</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <EmployeeForm
          employeeId={id}
          canEditPrivate={canEditPrivate}
          accounts={accounts}
          initialUserId={employee.user_id}
          attachedCompanyIds={attachedCompanyIds}
          companies={allCompanies ?? []}
          initial={{
            companyId: employee.company_id,
            fullName: employee.full_name,
            department: employee.department ?? "",
            position: employee.position ?? "",
            employmentType: employee.employment_type,
            status: employee.status,
            joinDate: employee.join_date ?? "",
            icPassportNo: employee.ic_passport_no ?? "",
            phone: employee.phone ?? "",
            email: employee.email ?? "",
            bankName: privateDetails?.bank_name ?? "",
            bankAccountNo: privateDetails?.bank_account_no ?? "",
            epfNo: privateDetails?.epf_no ?? "",
            socsoNo: privateDetails?.socso_no ?? "",
            taxNo: privateDetails?.tax_no ?? "",
            taxBranch: privateDetails?.tax_branch ?? "",
            bankId: privateDetails?.bank_id ?? "",
            bankBranchCode: privateDetails?.bank_branch_code ?? "",
            basicRate: privateDetails?.basic_rate != null ? String(privateDetails.basic_rate) : "",
            payBasis: privateDetails?.pay_basis ?? "",
            paymentMode: privateDetails?.payment_mode ?? "",
            employeeNo: employee.employee_no ?? "",
            oldIcNo: employee.old_ic_no ?? "",
            passportNo: employee.passport_no ?? "",
            homePhone: employee.home_phone ?? "",
            addressLine: employee.address_line ?? "",
            addressCity: employee.address_city ?? "",
            addressState: employee.address_state ?? "",
            addressPostcode: employee.address_postcode ?? "",
            permAddressLine: employee.perm_address_line ?? "",
            permCity: employee.perm_city ?? "",
            permState: employee.perm_state ?? "",
            permPostcode: employee.perm_postcode ?? "",
            spouseName: employee.spouse_name ?? "",
            spouseIcNo: employee.spouse_ic_no ?? "",
            spouseWorking: employee.spouse_working === true ? "Yes" : employee.spouse_working === false ? "No" : "",
            childrenCount: employee.children_count != null ? String(employee.children_count) : "",
            childRelief: employee.child_relief != null ? String(employee.child_relief) : "",
            emergencyName: employee.emergency_name ?? "",
            emergencyPhone: employee.emergency_phone ?? "",
            emergencyRelationship: employee.emergency_relationship ?? "",
            jobLevel: employee.job_level ?? "",
            dateConfirmed: employee.date_confirmed ?? "",
            datePromoted: employee.date_promoted ?? "",
            resignDate: employee.resign_date ?? "",
            educationBackground: employee.education_background ?? "",
            workingExperience: employee.working_experience ?? "",
            dateOfBirth: employee.date_of_birth ?? "",
            nationality: employee.nationality ?? "",
            gender: employee.gender ?? "",
            race: employee.race ?? "",
            religion: employee.religion ?? "",
            maritalStatus: employee.marital_status ?? "",
            branch: employee.branch ?? "",
            shortName: employee.short_name ?? "",
          }}
        />
      </div>
    </div>
  );
}
