import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getDriver } from "@/lib/driver/queries";
import { DriverProfileForm } from "@/components/driver/DriverProfileForm";

export default async function EditDriverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let driver;
  try {
    driver = await getDriver(supabase, id);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit Driver — {driver.employees?.full_name}</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <DriverProfileForm
          driverId={id}
          initial={{
            license_number: driver.license_number,
            license_expiry: driver.license_expiry,
            notes: driver.notes,
            approved_latitude: driver.approved_latitude,
            approved_longitude: driver.approved_longitude,
          }}
        />
      </div>
    </div>
  );
}
