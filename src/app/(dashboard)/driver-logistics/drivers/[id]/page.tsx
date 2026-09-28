import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getDriver, listDeliveriesForDriver } from "@/lib/driver/queries";
import { AVAILABILITY_LABEL, DELIVERY_STATUS_LABEL, isExpiringSoon } from "@/lib/driver/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverAvailabilitySelect } from "@/components/driver/DriverAvailabilitySelect";

export default async function DriverDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();

  let driver;
  try {
    driver = await getDriver(supabase, id);
  } catch {
    notFound();
  }

  const deliveries = driver.employees ? await listDeliveriesForDriver(supabase, driver.employees.id) : [];
  const licenseExpiring = isExpiringSoon(driver.license_expiry);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/driver-logistics/drivers${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Drivers
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{driver.employees?.full_name}</div>
          <div className="text-[13px] text-text-secondary">
            {driver.companies?.name}
            {driver.employees?.phone && ` · ${driver.employees.phone}`}
            {driver.employees?.email && ` · ${driver.employees.email}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DriverAvailabilitySelect driverId={id} status={driver.availability_status} />
          <Link href={`/driver-logistics/drivers/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Availability</div>
          <div className="mt-1"><StatusBadge tone="info">{AVAILABILITY_LABEL[driver.availability_status] ?? driver.availability_status}</StatusBadge></div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">License Number</div>
          <div className="mt-1 text-lg font-extrabold text-text">{driver.license_number ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">License Expiry</div>
          <div className="mt-1 flex items-center gap-2 text-lg font-extrabold text-text">
            {driver.license_expiry ?? "—"}
            {licenseExpiring && <StatusBadge tone="warning">Expiring</StatusBadge>}
          </div>
        </div>
      </div>

      {driver.notes && (
        <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Notes</div>
          {driver.notes}
        </div>
      )}

      <SectionCard title="Recent Deliveries">
        {deliveries.length === 0 ? (
          <EmptyRow text="No deliveries assigned yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {deliveries.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <span className="font-semibold text-text">{d.catering_events?.event_name ?? "Delivery"}</span>
                  <span className="ml-2 text-text-muted">{d.vehicles?.plate_number ?? "No vehicle"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-text-secondary">{d.scheduled_time ? new Date(d.scheduled_time).toLocaleDateString("en-MY") : "—"}</span>
                  <StatusBadge tone="neutral">{DELIVERY_STATUS_LABEL[d.status] ?? d.status}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
