import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listOtStaffOptions } from "@/lib/hr/otStaff";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { OvertimeFormGuide } from "@/components/shared/FormGuides";
import { OvertimeForm } from "@/components/hr/OvertimeForm";
import { EmptyRow } from "@/components/dashboard/SectionCard";

export default async function NewOvertimePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; employee?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, employee: employeeParam } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  if (accessibleIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const staff = await listOtStaffOptions(supabase, accessibleIds, session.userId);
  const query = requestedId ? `?company=${requestedId}` : "";

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/hr/overtime${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Overtime</Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Staff OT Form</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">Submit your daily overtime. The OT hours are calculated automatically from the start and end time.</p>
      <div className="mt-3">
        <OvertimeFormGuide />
      </div>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <OvertimeForm staff={staff} defaultEmployeeId={staff.some((s) => s.id === employeeParam) ? employeeParam : undefined} maxDate={todayInMalaysia()} />
      </div>
    </div>
  );
}
