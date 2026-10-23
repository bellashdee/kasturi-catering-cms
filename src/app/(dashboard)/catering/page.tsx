import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listEvents } from "@/lib/catering/queries";
import { EVENT_STATUS_LABEL, EVENT_TYPE_LABEL } from "@/lib/catering/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SearchBox } from "@/components/SearchBox";
import { CopyLink } from "@/components/driver/CopyLink";
import { INTAKE_COMPANIES } from "@/lib/catering/intake";
import { CateringSubNav } from "@/components/catering/CateringSubNav";

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "completed" || status === "confirmed") return "success";
  if (status === "cancelled") return "danger";
  if (status === "enquiry") return "warning";
  if (status === "quoted" || status === "in_production" || status === "delivered") return "info";
  return "neutral";
}

export default async function CateringPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, q } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const events = await listEvents(supabase, targetCompanyIds, q);
  const { count: pendingRequests } = await supabase
    .from("quotation_requests")
    .select("id", { count: "exact", head: true })
    .in("company_id", targetCompanyIds)
    .eq("status", "pending");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Catering Events</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{events.length} event{events.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2.5">
          <Link href={`/catering/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Event
          </Link>
        </div>
      </div>

      <CateringSubNav />

      {pendingRequests ? (
        <Link href={`/catering/quotation-requests${query}`} className="rounded-xl border border-info bg-info-bg px-4 py-3 text-[13px] font-semibold text-text hover:opacity-90">
          {`Quotation requests waiting for review: ${pendingRequests}. They are on the Event Calendar too.`}
        </Link>
      ) : null}

      <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div>
          <div className="text-[14px] font-bold text-text">Request Quotation form: link for sales agents</div>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">Copy the link of the company and send it to the sales agent. They fill in the event and menu without logging in, and it appears under Quotation Requests.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(INTAKE_COMPANIES)
            .filter(([, c]) => targetCompanyIds.includes(c.id))
            .map(([slug, c]) => (
              <CopyLink key={slug} path={`/quotation-form/${slug}`} label={c.name} />
            ))}
        </div>
      </div>

      <SearchBox placeholder="Search events by name..." />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {events.length === 0 ? (
          <EmptyRow text="No catering events yet. Create one to start quoting and planning." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.8fr_1.2fr_1fr_0.8fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Event</div>
              <div>Customer</div>
              <div>Date</div>
              <div>Pax</div>
              <div>Type</div>
              <div>Amount</div>
              <div>Status</div>
            </div>
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/catering/${e.id}${query}`}
                className="grid grid-cols-[1.8fr_1.2fr_1fr_0.8fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">
                  {e.event_name}
                  {companies.length > 1 && <span className="ml-2 text-[11px] font-normal text-text-muted">{e.companies?.name}</span>}
                </div>
                <div className="text-text-secondary">{e.customers?.name || "—"}</div>
                <div className="text-text-secondary">{e.event_date}{e.end_date ? ` → ${e.end_date}` : ""}</div>
                <div className="text-text-secondary">{e.pax_count ?? "—"}</div>
                <div className="text-text-secondary">{EVENT_TYPE_LABEL[e.event_type] ?? e.event_type}</div>
                <div className="text-text-secondary">{e.total_amount != null ? formatCurrency(e.total_amount) : "—"}</div>
                <div>
                  <StatusBadge tone={statusTone(e.status)}>{EVENT_STATUS_LABEL[e.status] ?? e.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
