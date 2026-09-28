import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getVehicle } from "@/lib/driver/queries";
import { VehicleForm } from "@/components/driver/VehicleForm";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let vehicle;
  try {
    vehicle = await getVehicle(supabase, id);
  } catch {
    notFound();
  }

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit Vehicle</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <VehicleForm
          companies={allCompanies ?? []}
          vehicleId={id}
          initial={{
            companyId: vehicle.company_id,
            plateNumber: vehicle.plate_number,
            vehicleType: vehicle.vehicle_type ?? undefined,
            status: vehicle.status,
            insuranceExpiry: vehicle.insurance_expiry ?? undefined,
            roadTaxExpiry: vehicle.road_tax_expiry ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
