import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEvent, listEventDays, toEventDays } from "@/lib/catering/queries";
import { EventForm } from "@/components/catering/EventForm";
import { eventNeeds, needsFormValue } from "@/lib/catering/customerNeeds";

type PackageRow = { id: string; name: string; price_per_pax: number; minimum_pax: number; company_id: string; package_menu_items: { meal_type: string; item_name: string; sort_order: number }[] };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let event;
  try {
    event = await getEvent(supabase, id);
  } catch {
    notFound();
  }

  const days = toEventDays(await listEventDays(supabase, id));
  // an older event made from a quotation request starts from that request's answers
  const { data: fromRequest } = await supabase.from("quotation_requests").select("requirements, additional, extra_items").eq("catering_event_id", id).maybeSingle();
  const initialNeeds = needsFormValue(eventNeeds(event, fromRequest), { kitchenSetup: event.kitchen_setup, cateringSetup: event.catering_setup, remarks: event.remarks });
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const { data: customers } = await supabase.from("customers").select("id, name, company_id").order("name");
  const { data: packageMenus } = await supabase
    .from("package_menus")
    .select("id, name, price_per_pax, minimum_pax, company_id, package_menu_items(meal_type, item_name, sort_order)")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit {event.event_name}</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <EventForm
          eventId={id}
          companies={allCompanies ?? []}
          customers={customers ?? []}
          packageMenus={(packageMenus ?? []) as PackageRow[]}
          initialDays={days}
          initialNeeds={initialNeeds}
          initial={{
            companyId: event.company_id,
            customerId: event.customer_id ?? undefined,
            eventName: event.event_name,
            eventDate: event.event_date,
            eventTime: event.event_time?.slice(0, 5) ?? "",
            setupTime: event.setup_time?.slice(0, 5) ?? "",
            picName: event.pic_name ?? "",
            picPhone: event.pic_phone ?? "",
            salesAgent: event.sales_agent ?? "",
            kitchenSetup: event.kitchen_setup ?? "",
            cateringSetup: event.catering_setup ?? "",
            endTime: event.end_time?.slice(0, 5) ?? "",
            eventAddress: event.event_address ?? "",
            autocountQuotationNo: event.autocount_quotation_no ?? "",
            autocountInvoiceNo: event.autocount_invoice_no ?? "",
            pricePerPax: event.price_per_pax !== null ? Number(event.price_per_pax) : undefined,
            location: event.location ?? "",
            paxCount: event.pax_count ?? undefined,
            eventType: event.event_type,
            packageMenuId: event.package_menu_id ?? undefined,
            menuDescription: event.menu_description ?? "",
            specialRequirements: event.special_requirements ?? "",
            mealTypes: event.meal_types ?? [],
            serviceType: event.service_type ?? "",
            servicePax: event.service_pax ?? undefined,
            secondServiceType: event.second_service_type ?? "",
            secondServicePax: event.second_service_pax ?? undefined,
            eventDetails: event.event_details ?? "",
            remarks: event.remarks ?? "",
            status: event.status,
          }}
        />
      </div>
    </div>
  );
}
