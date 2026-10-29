import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { DeliveryFormGuide } from "@/components/shared/FormGuides";
import { DeliveryForm } from "@/components/driver/DeliveryForm";
import { listDeliveryPersons } from "@/lib/driver/queries";

export default async function NewDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  const [{ data: events }, { data: vehicles }, deliveryPersons] = await Promise.all([
    supabase.from("catering_events").select("id, event_name, company_id, event_date, customers(name)").in("company_id", accessibleIds).order("event_date", { ascending: false }),
    supabase.from("vehicles").select("id, plate_number, vehicle_type, company_id").in("company_id", accessibleIds).order("plate_number"),
    listDeliveryPersons(supabase, accessibleIds),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-extrabold text-text">New Delivery</h1>
        <DeliveryFormGuide />
      </div>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <DeliveryForm
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          events={events ?? []}
          vehicles={vehicles ?? []}
          deliveryPersons={deliveryPersons}
        />
      </div>
    </div>
  );
}
