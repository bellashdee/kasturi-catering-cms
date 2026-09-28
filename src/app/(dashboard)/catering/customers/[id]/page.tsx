import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getCustomerWithEvents } from "@/lib/catering/queries";
import { EVENT_STATUS_LABEL } from "@/lib/catering/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "completed" || status === "confirmed") return "success";
  if (status === "cancelled") return "danger";
  if (status === "enquiry") return "warning";
  return "info";
}

export default async function CustomerHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let customer, events;
  try {
    ({ customer, events } = await getCustomerWithEvents(supabase, id));
  } catch {
    notFound();
  }

  const totalRevenue = events.reduce((t, e) => t + Number(e.total_amount ?? 0), 0);
  const completedCount = events.filter((e) => e.status === "completed").length;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/catering/customers" className="text-[12.5px] font-semibold text-text-secondary">← Back to Customers</Link>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-base font-bold text-white">
          {customer.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-[20px] font-extrabold text-text">{customer.name}</div>
          <div className="text-[13px] text-text-secondary">
            {customer.contact_person && `${customer.contact_person} · `}{customer.phone || "No phone"} · {customer.companies?.name}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total Events</div>
          <div className="mt-1 text-xl font-extrabold text-text">{events.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Completed</div>
          <div className="mt-1 text-xl font-extrabold text-text">{completedCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Lifetime Revenue</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(totalRevenue)}</div>
        </div>
      </div>

      <SectionCard title="Event History">
        {events.length === 0 ? (
          <EmptyRow text="No events for this customer yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {events.map((e) => (
              <Link key={e.id} href={`/catering/${e.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-surface-alt">
                <div>
                  <div className="text-[13px] font-semibold text-text">{e.event_name}</div>
                  <div className="text-xs text-text-muted">{e.event_date} · {e.pax_count ?? "—"} pax</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-semibold text-text">{e.total_amount != null ? formatCurrency(e.total_amount) : "—"}</span>
                  <StatusBadge tone={statusTone(e.status)}>{EVENT_STATUS_LABEL[e.status] ?? e.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Contact">
        <StatRow label="Phone" value={customer.phone || "—"} />
        <StatRow label="Email" value={customer.email || "—"} />
        <StatRow label="Contact Person" value={customer.contact_person || "—"} />
      </SectionCard>
    </div>
  );
}
