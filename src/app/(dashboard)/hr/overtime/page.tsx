import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listOvertimeForCompanies } from "@/lib/hr/queries";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { OvertimeRowActions } from "@/components/hr/OvertimeRowActions";

export default async function OvertimePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const records = await listOvertimeForCompanies(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Overtime</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Across all employees you can access.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {records.length === 0 ? (
          <EmptyRow text="No overtime logged yet." />
        ) : (
          <div className="divide-y divide-border">
            {records.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">
                    <Link href={`/hr/${r.employee_id}`} className="hover:text-primary">{r.employees?.full_name}</Link>
                    <span className="ml-2 text-text-secondary font-normal">{r.hours}h on {r.work_date}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">{r.reason || "No reason given"} · {r.companies?.name}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>
                    {r.status}
                  </StatusBadge>
                  {r.status === "pending" && <OvertimeRowActions overtimeId={r.id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
