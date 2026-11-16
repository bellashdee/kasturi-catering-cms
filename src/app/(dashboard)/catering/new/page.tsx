import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EventForm } from "@/components/catering/EventForm";
import type { EventInput } from "@/lib/catering/actions";
import type { EventDay } from "@/lib/catering/days";
import { needsFormValue, requestNeeds, type CustomerNeedsValue } from "@/lib/catering/customerNeeds";

type PackageRow = { id: string; name: string; price_per_pax: number; minimum_pax: number; company_id: string; package_menu_items: { meal_type: string; item_name: string; sort_order: number }[] };

/** "JDT FC SDN. BHD." and "JDT FC Sdn Bhd" are the same customer. */
const sameName = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Where the request stands in the inbox, as the event status to start from. */
function statusFromTracking(tracking: string): string {
  if (tracking === "customer_confirmed") return "confirmed";
  if (["quotation_prepared", "sent_to_customer", "follow_up_required"].includes(tracking)) return "quoted";
  return "enquiry";
}

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; fromRequest?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("user_has_quotation_request_access");
  if (allowed !== true) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
        <div className="text-[16px] font-extrabold text-text">New Catering Event</div>
        <p className="mt-2 text-[13px] text-text-secondary">Only Ms. Nabilah, Mr. Adlan and Ms. Penny can add events. Confirmed events come in through the Excel import.</p>
      </div>
    );
  }
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, fromRequest: fromRequestId } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  let defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, company_id")
    .in("company_id", accessibleIds)
    .order("name");

  const { data: packageMenus } = await supabase
    .from("package_menus")
    .select("id, name, price_per_pax, minimum_pax, company_id, package_menu_items(meal_type, item_name, sort_order)")
    .in("company_id", accessibleIds)
    .eq("is_active", true)
    .order("name");

  // "Create event from this request": the form starts with everything the sales agent sent (nothing is saved until Create Event)
  let initial: Partial<EventInput> | undefined;
  let initialDays: EventDay[] = [];
  let initialNeeds: CustomerNeedsValue | undefined;
  let fromRequest: { id: string; code: string } | undefined;
  if (fromRequestId && /^[0-9a-f-]{36}$/i.test(fromRequestId)) {
    const { data: r } = await supabase.from("quotation_requests").select("*").eq("id", fromRequestId).maybeSingle();
    if (r && accessibleIds.includes(r.company_id) && !r.catering_event_id) {
      defaultCompanyId = r.company_id;
      const days = (r.days as unknown as EventDay[]) ?? [];
      const customer = (customers ?? []).find((c) => c.company_id === r.company_id && sameName(c.name, r.customer_name ?? ""));
      initialDays = days;
      initial = {
        companyId: r.company_id,
        customerId: customer?.id,
        eventName: r.event_name ?? "",
        eventType: r.event_type ?? "corporate_event",
        location: r.location ?? "",
        eventAddress: r.event_address ?? "",
        picName: r.pic_name ?? "",
        picPhone: r.pic_phone ?? "",
        salesAgent: r.sales_agent ?? "",
        autocountQuotationNo: r.autocount_quotation_no ?? "",
        autocountInvoiceNo: r.autocount_invoice_no ?? "",
        endTime: days[days.length - 1]?.endTime,
        status: statusFromTracking(r.tracking_status),
      };
      initialNeeds = needsFormValue(requestNeeds(r), { kitchenSetup: r.kitchen_setup, cateringSetup: r.catering_setup, remarks: r.remarks });
      fromRequest = { id: r.id, code: r.request_code ?? "" };
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">New Catering Event</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <EventForm
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          customers={customers ?? []}
          packageMenus={(packageMenus ?? []) as PackageRow[]}
          initial={initial}
          initialDays={initialDays}
          initialNeeds={initialNeeds}
          fromRequest={fromRequest}
        />
      </div>
    </div>
  );
}
