import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listDrivers } from "@/lib/driver/queries";
import { AVAILABILITY_LABEL, isExpiringSoon } from "@/lib/driver/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";

function availabilityTone(status: string): "success" | "warning" | "neutral" | "info" {
  if (status === "available") return "success";
  if (status === "on_delivery") return "info";
  if (status === "on_leave") return "warning";
  return "neutral";
}

export default async function DriversPage({
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

  const drivers = await listDrivers(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Driver & Logistics</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{drivers.length} driver{drivers.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/driver-logistics/drivers/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Driver
        </Link>
      </div>

      <DriverLogisticsSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {drivers.length === 0 ? (
          <EmptyRow text="No drivers yet. Add one from an existing HR employee or create a new person." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.6fr_1.2fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Name</div>
              <div>Contact</div>
              <div>Company</div>
              <div>License Expiry</div>
              <div>Availability</div>
            </div>
            {drivers.map((d) => (
              <Link
                key={d.id}
                href={`/driver-logistics/drivers/${d.id}${query}`}
                className="grid grid-cols-[1.6fr_1.2fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">{d.employees?.full_name}</div>
                <div className="text-text-secondary">{d.employees?.phone ?? d.employees?.email ?? "—"}</div>
                <div className="text-text-secondary">{d.companies?.name}</div>
                <div className="flex items-center gap-2 text-text-secondary">
                  {d.license_expiry ?? "—"}
                  {isExpiringSoon(d.license_expiry) && <StatusBadge tone="warning">Expiring</StatusBadge>}
                </div>
                <div>
                  <StatusBadge tone={availabilityTone(d.availability_status)}>{AVAILABILITY_LABEL[d.availability_status] ?? d.availability_status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
