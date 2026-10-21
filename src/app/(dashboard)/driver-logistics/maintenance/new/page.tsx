import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { MaintenanceUploadReview } from "@/components/driver/MaintenanceUploadReview";

export default async function NewMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; vehicle?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, vehicle } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;
  const query = requestedId ? `?company=${requestedId}` : "";

  const { data: vehicles } = await supabase.from("vehicles").select("id, plate_number, vehicle_type, company_id").in("company_id", accessibleIds).order("plate_number");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold text-text">Log Service Record</h1>
      <p className="mt-1 text-[13px] text-text-secondary">Enter it manually, or upload a workshop invoice for AI to read.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <MaintenanceUploadReview
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          vehicles={vehicles ?? []}
          defaultVehicleId={vehicle}
          redirectTo={`/driver-logistics/maintenance${query}`}
        />
      </div>
    </div>
  );
}
