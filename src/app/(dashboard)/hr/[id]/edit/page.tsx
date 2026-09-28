import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEmployee } from "@/lib/hr/queries";
import { EmployeeForm } from "@/components/hr/EmployeeForm";

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

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit {employee.full_name}</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <EmployeeForm
          employeeId={id}
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
          }}
        />
      </div>
    </div>
  );
}
