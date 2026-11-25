import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { displayNames } from "@/lib/hr/superiors";
import { mergeWithTemplate, SIGNATURES, type ChecklistItem } from "@/lib/driver/equipmentChecklist";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { EquipmentChecklistForm } from "@/components/driver/EquipmentChecklistForm";

/** One event's equipment checklist, in the layout of TEMPLATE EQUIPMENT CATERING.xlsx. */
export default async function EquipmentChecklistPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("catering_events")
    .select("id, event_name, event_date, event_time, setup_time, pax_count, location, companies(name)")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();
  const { data: list } = await untyped(supabase).from("equipment_checklists").select("*").eq("catering_event_id", id).maybeSingle();
  const row = (list ?? null) as (Record<string, unknown> & { items?: ChecklistItem[]; notes?: string | null }) | null;
  const names = await displayNames(
    supabase,
    SIGNATURES.map((s) => (row?.[`${s.key}_by`] as string | null) ?? null),
  );
  const signatures = Object.fromEntries(
    SIGNATURES.map((s) => {
      const by = (row?.[`${s.key}_by`] as string | null) ?? null;
      return [s.key, by ? { name: names.get(by) ?? "—", at: (row?.[`${s.key}_at`] as string | null) ?? null, mine: by === session.userId } : null];
    }),
  );
  const query = sp.company ? `?company=${sp.company}` : "";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/driver-logistics/equipment${query}`} className="text-[12.5px] font-semibold text-text-secondary hover:text-text">← Back to Equipment Checklist</Link>
        <h1 className="mt-1 text-[22px] font-extrabold text-text">Operation Management</h1>
      </div>
      <DriverLogisticsSubNav />
      <EquipmentChecklistForm
        event={{
          id: event.id,
          client: event.event_name,
          venue: event.location,
          pax: event.pax_count,
          date: event.event_date,
          eventTime: event.event_time,
          setupTime: event.setup_time,
          company: (event.companies as { name?: string } | null)?.name ?? "",
        }}
        items={mergeWithTemplate(row?.items)}
        notes={row?.notes ?? ""}
        saved={!!row}
        signatures={signatures}
      />
    </div>
  );
}
