import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listMaintenanceForCompanies } from "@/lib/driver/queries";
import { formatCurrency } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";

export default async function MaintenancePage({
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
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const records = await listMaintenanceForCompanies(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{records.length} service record{records.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/driver-logistics/maintenance/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + Log Service
        </Link>
      </div>

      <DriverLogisticsSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {records.length === 0 ? (
          <EmptyRow text="No service records yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.4fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Vehicle</div>
              <div>Service Date</div>
              <div>Next Service</div>
              <div>Cost</div>
              <div>Company / Notes</div>
            </div>
            {records.map((m) => (
              <div key={m.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_1.4fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                <div className="font-semibold text-text">{m.vehicles?.plate_number ?? "—"}</div>
                <div className="text-text-secondary">{m.service_date}</div>
                <div className="text-text-secondary">{m.next_service_date ?? "—"}</div>
                <div className="text-text-secondary">{formatCurrency(Number(m.cost))}</div>
                <div className="truncate text-text-muted">{m.companies?.name}{m.notes ? ` · ${m.notes}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
