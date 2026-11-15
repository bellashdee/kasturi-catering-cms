import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listEvents, monthRange } from "@/lib/catering/queries";
import { EVENT_STATUS_LABEL, EVENT_TYPE_LABEL } from "@/lib/catering/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { MonthFilter } from "@/components/MonthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";
import { CopyLink } from "@/components/driver/CopyLink";
import { INTAKE_COMPANIES } from "@/lib/catering/intake";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { CalendarEntryActions } from "@/components/catering/CalendarEntryActions";
import { CalendarUndoBanner } from "@/components/catering/CalendarUndoBanner";

const SORTS = { date: "Event date", customer: "Customer", reference: "Event reference", event: "Event name", amount: "Amount", status: "Status" };
const STATUS_ORDER = Object.keys(EVENT_STATUS_LABEL);

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
  searchParams: Promise<{ company?: string; q?: string; month?: string; customer?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, q, month } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const listed = await listEvents(supabase, targetCompanyIds, undefined, month);
  // the event reference (EV-...) of each listed event, for the search and the sort
  const { data: refs } = listed.length
    ? await supabase.from("catering_events").select("id, event_reference").in("id", listed.map((e) => e.id))
    : { data: [] as { id: string; event_reference: string | null }[] };
  const refOf = new Map((refs ?? []).map((r) => [r.id, r.event_reference]));
  const loaded = listed.map((e) => ({ ...e, event_reference: refOf.get(e.id) ?? null }));
  const has = (value: string | null | undefined, part: string | undefined) => !part || (value ?? "").toLowerCase().includes(part.trim().toLowerCase());
  const events = sortBy(
    loaded.filter((e) => (has(e.event_name, q) || has(e.event_reference, q)) && has(e.customers?.name, sp.customer) && (!sp.status || e.status === sp.status)),
    sort,
    dir,
    {
      date: [(e) => e.event_date, (e) => e.event_name],
      customer: [(e) => e.customers?.name, (e) => e.event_date],
      reference: (e) => e.event_reference,
      event: [(e) => e.event_name, (e) => e.event_date],
      amount: (e) => e.total_amount,
      status: [(e) => STATUS_ORDER.indexOf(e.status), (e) => e.event_date],
    },
  );
  const filtered = Boolean(q || sp.customer || sp.status);
  const range = monthRange(month);
  const monthLabel = range ? new Date(`${range.start}T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : null;
  const adminFlags = await Promise.all(
    targetCompanyIds.map(async (id) => {
      const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: id });
      return [id, data === true] as const;
    }),
  );
  const adminCompanyIds = new Set(adminFlags.filter(([, isAdmin]) => isAdmin).map(([id]) => id));
  // New Event is for the people who also import confirmed events (Ms. Nabilah, Mr. Adlan, Ms. Penny)
  const { data: canAddEvents } = await supabase.rpc("user_has_quotation_request_access");
  const { count: pendingRequests } = await supabase
    .from("quotation_requests")
    .select("id", { count: "exact", head: true })
    .in("company_id", targetCompanyIds)
    .eq("tracking_status", "new_request");
  // customer details sent by sales agents through the public form, waiting for the office (also counted in the Catering menu badge)
  const { count: pendingCustomers } = await supabase
    .from("customer_intake_submissions")
    .select("id", { count: "exact", head: true })
    .in("company_id", targetCompanyIds)
    .eq("status", "pending");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Catering Events</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {events.length} event{events.length === 1 ? "" : "s"}
            {monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}
          </p>
        </div>
        {canAddEvents === true && (
          <div className="flex gap-2.5">
            <Link href={`/catering/import${query}`} className="rounded-lg border border-primary bg-surface px-4 py-2.5 text-[13px] font-semibold text-primary">
              Import from Excel
            </Link>
            <Link href={`/catering/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
              + New Event
            </Link>
          </div>
        )}
      </div>

      <CateringSubNav />

      <CalendarUndoBanner />

      {pendingRequests ? (
        <Link href={`/catering/quotation-requests${query}`} className="rounded-xl border border-info bg-info-bg px-4 py-3 text-[13px] font-semibold text-text hover:opacity-90">
          {`New quotation requests in the inbox: ${pendingRequests}. They are not events: a confirmed event comes in through the Excel import or New Event.`}
        </Link>
      ) : null}

      {pendingCustomers ? (
        <Link href={`/catering/customers/submissions${query}`} className="rounded-xl border border-info bg-info-bg px-4 py-3 text-[13px] font-semibold text-text hover:opacity-90">
          {`New customer details from sales agents waiting for review: ${pendingCustomers}. Open to check and approve →`}
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

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/catering?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), ...(month ? { month } : {}) }).toString()}`}>
        <FilterField label="Event name / reference">
          <input name="q" defaultValue={q ?? ""} className={`${FILTER_INPUT} w-48`} />
        </FilterField>
        <FilterField label="Customer">
          <input name="customer" defaultValue={sp.customer ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All statuses</option>
            {Object.entries(EVENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {events.length === 0 ? (
          <EmptyRow text={filtered ? "No catering events match these filters." : monthLabel ? "No catering events in this month." : "No catering events yet. Create one to start quoting and planning."} />
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
              <div key={e.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/catering/${e.id}${query}`}
                className="grid grid-cols-[1.8fr_1.2fr_1fr_0.8fr_1fr_1fr_1fr] px-5 py-3.5 text-[13.5px] hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">
                  {e.event_name}
                  {e.event_reference && <span className="ml-2 font-mono text-[11px] font-normal text-text-muted">{e.event_reference}</span>}
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
              <div className="px-5 pb-3">
                <CalendarEntryActions
                  key={`${e.id}:${e.event_date}:${e.event_time}:${e.setup_time}:${e.pax_count}:${e.status}`}
                  entry={{ kind: "event", eventId: e.id, requestId: null, dayId: null, status: e.status, eventName: e.event_name, date: e.event_date, eventTime: e.event_time ? e.event_time.slice(0, 5) : "", setupTime: e.setup_time ? e.setup_time.slice(0, 5) : "", venue: e.location, pax: e.pax_count ?? 0, twoServices: !!e.second_service_type }}
                  canDelete={adminCompanyIds.has(e.company_id)}
                  canQuickEdit={(e.catering_event_days ?? []).length === 0}
                  query={query}
                />
              </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
