import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { hrAdminCompanyIds } from "@/lib/hr/permissions";
import { listDepartments } from "@/lib/hr/queries";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { DepartmentManager } from "@/components/hr/DepartmentManager";

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const hrIds = await hrAdminCompanyIds(supabase, targetCompanyIds);
  if (hrIds.length === 0) return <EmptyRow text="Only an HR Admin can manage departments." />;

  const departments = await listDepartments(supabase, hrIds);
  const query = requestedId ? `?company=${requestedId}` : "";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/hr${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Employee Directory</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Departments</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Each company has its own departments. Obsolete ones are marked inactive, never deleted.</p>
      </div>
      {companies
        .filter((c) => hrIds.includes(c.id))
        .map((c) => (
          <SectionCard key={c.id} title={c.name}>
            <DepartmentManager companyId={c.id} departments={departments.filter((d) => d.company_id === c.id)} />
          </SectionCard>
        ))}
    </div>
  );
}
