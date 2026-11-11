import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEmployeePrivateDetails } from "@/lib/hr/queries";
import { OwnProfileForm } from "@/components/hr/OwnProfileForm";
import { EmptyRow } from "@/components/dashboard/SectionCard";

/** Edit my details: every staff member changes their own personal details here (contact, address, emergency contact, bank, KWSP, SOCSO, tax ...). */
export default async function EditMyProfilePage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { record } = await searchParams;

  const supabase = await createClient();
  const { data: own } = await supabase.from("employees").select("*, companies(name)").eq("user_id", session.userId).order("full_name");
  const records = own ?? [];
  const employee = records.find((e) => e.id === record) ?? records[0];

  if (!employee) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-[22px] font-extrabold text-text">Edit my details</h1>
        <EmptyRow text="Your staff record is not linked to your login yet. Please ask HR to link it." />
      </div>
    );
  }

  const privateDetails = await getEmployeePrivateDetails(supabase, employee.id);
  const companies = records.map((r) => r.companies?.name).filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/profile${record ? `?record=${record}` : ""}`} className="text-[12.5px] font-semibold text-text-secondary">
        ← Back to My Profile
      </Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Edit my details</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <OwnProfileForm
          returnTo={`/profile${record ? `?record=${record}` : ""}`}
          fixed={{ name: employee.full_name, ic: employee.ic_passport_no ?? "", email: employee.email ?? session.email ?? "", position: employee.position ?? "", company: companies }}
          initial={{
            phone: employee.phone ?? "",
            homePhone: employee.home_phone ?? "",
            passportNo: employee.passport_no ?? "",
            oldIcNo: employee.old_ic_no ?? "",
            dateOfBirth: employee.date_of_birth ?? "",
            gender: employee.gender ?? "",
            nationality: employee.nationality ?? "",
            race: employee.race ?? "",
            religion: employee.religion ?? "",
            maritalStatus: employee.marital_status ?? "",
            shortName: employee.short_name ?? "",
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
            educationBackground: employee.education_background ?? "",
            workingExperience: employee.working_experience ?? "",
            bankName: privateDetails?.bank_name ?? "",
            bankAccountNo: privateDetails?.bank_account_no ?? "",
            epfNo: privateDetails?.epf_no ?? "",
            socsoNo: privateDetails?.socso_no ?? "",
            taxNo: privateDetails?.tax_no ?? "",
            taxBranch: privateDetails?.tax_branch ?? "",
            bankId: privateDetails?.bank_id ?? "",
            bankBranchCode: privateDetails?.bank_branch_code ?? "",
          }}
        />
      </div>
    </div>
  );
}
