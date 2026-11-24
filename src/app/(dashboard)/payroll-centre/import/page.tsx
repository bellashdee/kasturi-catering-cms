import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { todayInMalaysia } from "@/lib/format";
import { canUsePayrollCentre } from "@/lib/hr/payrollAccess";
import { isValidMonth } from "@/lib/hr/payrollCentre";
import type { StaffOption } from "@/lib/hr/payslipImport";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { PayslipImportFlow } from "@/components/hr/PayslipImportFlow";

/** Payroll Centre → Import Payslips (PDF or Excel). Private: the Director of Finance and her personal assistant only. */
export default async function PayslipImportPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  if (!(await canUsePayrollCentre(supabase))) return <EmptyRow text="Payroll is private. Only the Director of Finance and her personal assistant can open the Payroll Centre." />;

  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { company: requestedId, month: requestedMonth } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const adminIds = await adminCompanyIds(supabase, targetCompanyIds);
  if (adminIds.length === 0) return <EmptyRow text="The Payroll Centre is only for Super Admin and Company Admin (Finance) users." />;

  const month = isValidMonth(requestedMonth) ? requestedMonth : todayInMalaysia().slice(0, 7);
  const { data: employees } = await supabase
    .from("employees")
    .select("id, company_id, full_name, employee_no, ic_passport_no, status, companies(name)")
    .in("company_id", adminIds)
    .order("full_name");
  const staff: StaffOption[] = (employees ?? [])
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, companyId: e.company_id, companyName: e.companies?.name ?? "", name: e.full_name, employeeNo: e.employee_no, ic: e.ic_passport_no }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/payroll-centre?month=${month}${requestedId ? `&company=${requestedId}` : ""}`} className="text-[12.5px] font-semibold text-text-secondary hover:text-text">
          ← Payroll Centre
        </Link>
        <h1 className="text-[22px] font-extrabold text-text">Import Payslips</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Bring in the month&apos;s salaries from the payslip PDF or the payroll Excel instead of keying in each staff.</p>
      </div>
      <PayslipImportFlow staff={staff} month={month} />
    </div>
  );
}
