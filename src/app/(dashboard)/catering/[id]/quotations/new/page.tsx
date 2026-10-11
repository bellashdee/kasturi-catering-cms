import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEvent, listEventDays, toEventDays } from "@/lib/catering/queries";
import { quotationSeedRows } from "@/lib/catering/days";
import { QuotationForm } from "@/components/catering/QuotationForm";

export default async function NewQuotationPage({ params }: { params: Promise<{ id: string }> }) {
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

  const seedRows = quotationSeedRows(toEventDays(await listEventDays(supabase, id)), {
    eventName: event.event_name,
    pax: event.pax_count,
    pricePerPax: event.price_per_pax !== null ? Number(event.price_per_pax) : null,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/catering/${id}`} className="text-[12.5px] font-semibold text-text-secondary">
        ← Back to {event.event_name}
      </Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">New Quotation</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <QuotationForm companyId={event.company_id} eventId={id} seedRows={seedRows} />
      </div>
    </div>
  );
}
