import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEvent } from "@/lib/catering/queries";
import { EventForm } from "@/components/catering/EventForm";

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

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const { data: customers } = await supabase.from("customers").select("id, name, company_id").order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit {event.event_name}</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <EventForm
          eventId={id}
          companies={allCompanies ?? []}
          customers={customers ?? []}
          initial={{
            companyId: event.company_id,
            customerId: event.customer_id ?? undefined,
            eventName: event.event_name,
            eventDate: event.event_date,
            eventTime: event.event_time ?? "",
            location: event.location ?? "",
            paxCount: event.pax_count ?? undefined,
            eventType: event.event_type,
            menuDescription: event.menu_description ?? "",
            specialRequirements: event.special_requirements ?? "",
            status: event.status,
          }}
        />
      </div>
    </div>
  );
}
