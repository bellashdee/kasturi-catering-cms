import Link from "next/link";
import { redirect } from "next/navigation";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SALES_AGENTS, SERVICE_TYPE_LABEL, SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";
import { dayPax, type EventDay } from "@/lib/catering/days";
import { TRACKING_STATUS_LABEL, TRACKING_STATUS_TONE } from "@/lib/catering/quotationRequest";
import { formatMalaysiaDate, formatMalaysiaDateTime } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { MonthFilter } from "@/components/MonthFilter";
import { monthLabelOf, monthRange } from "@/lib/monthFilter";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

type Search = {
  company?: string;
  q?: string;
  agent?: string;
  status?: string;
  eventFrom?: string;
  eventTo?: string;
  sentFrom?: string;
  sentTo?: string;
  sort?: string;
  dir?: string;
  month?: string;
};

const SORTS = {
  submitted: "Date submitted",
  date: "Event date",
  customer: "Customer",
  reference: "Request ID",
  event: "Event name",
  agent: "Sales agent",
  status: "Status",
  updated: "Last updated",
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The private inbox of the quotation requests sales agents send: only Ms. Nabilah, Mr. Adlan and Ms. Penny can open it. */
export default async function QuotationRequestsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("user_has_quotation_request_access");
  if (allowed !== true) return <NoAccess />;

  const sp = await searchParams;
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const query = sp.company ? `?company=${sp.company}` : "";

  let request = supabase
    .from("quotation_requests")
    .select("id, request_code, created_at, updated_at, sales_agent, customer_name, pic_name, event_name, days, tracking_status, company_id, companies(name), handler:profiles!quotation_requests_handled_by_fkey(full_name)")
    .in("company_id", targetCompanyIds);
  // the search box looks in the Request ID, customer, event name and sales agent (characters with a meaning to the filter are left out)
  const q = (sp.q ?? "").replace(/[,()*%\\]/g, " ").trim();
  if (q) request = request.or(["request_code", "customer_name", "event_name", "sales_agent", "pic_name"].map((c) => `${c}.ilike.*${q}*`).join(","));
  if (sp.agent) request = request.eq("sales_agent", sp.agent);
  if (sp.status && TRACKING_STATUS_LABEL[sp.status]) request = request.eq("tracking_status", sp.status);
  // the event date of a request is its first day
  if (sp.eventFrom && DATE.test(sp.eventFrom)) request = request.gte("days->0->>dayDate", sp.eventFrom);
  if (sp.eventTo && DATE.test(sp.eventTo)) request = request.lte("days->0->>dayDate", sp.eventTo);
  // the month is the day the request was received (submitted)
  const range = monthRange(sp.month);
  const monthLabel = monthLabelOf(sp.month);
  if (range) request = request.gte("created_at", `${range.start}T00:00:00+08:00`).lte("created_at", `${range.end}T23:59:59.999+08:00`);
  if (sp.sentFrom && DATE.test(sp.sentFrom)) request = request.gte("created_at", `${sp.sentFrom}T00:00:00+08:00`);
  if (sp.sentTo && DATE.test(sp.sentTo)) request = request.lte("created_at", `${sp.sentTo}T23:59:59.999+08:00`);
  // the old "oldest first" link still opens the oldest submitted first
  const { sort, dir } = sp.sort === "oldest" ? { sort: "submitted" as const, dir: "asc" as const } : readSort(sp, SORTS, "submitted", "desc");
  const { data: rows, error } = await request.order("created_at", { ascending: false }).limit(300);
  const firstDay = (r: { days: unknown }) => ((r.days as EventDay[] | null) ?? [])[0]?.dayDate;
  const requests = sortBy(rows ?? [], sort, dir, {
    submitted: (r) => r.created_at,
    date: [firstDay, (r) => r.created_at],
    customer: [(r) => r.customer_name, (r) => r.created_at],
    reference: (r) => r.request_code,
    event: [(r) => r.event_name, (r) => r.created_at],
    agent: [(r) => r.sales_agent, (r) => r.created_at],
    status: [(r) => Object.keys(TRACKING_STATUS_LABEL).indexOf(r.tracking_status), (r) => r.created_at],
    updated: (r) => r.updated_at,
  });
  const filtered = Boolean(q || sp.agent || sp.status || sp.eventFrom || sp.eventTo || sp.sentFrom || sp.sentTo);
  const waiting = requests.filter((r) => r.tracking_status === "new_request").length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Quotation Request Inbox</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Requests sent by sales agents. Prepare the official quotation and invoice in AutoCount and record the numbers here. A request never
          becomes an event: confirmed events come in through the Excel import or New Event.
        </p>
      </div>

      <CateringSubNav />

      {targetCompanyIds.includes(SIGNATURE_COMPANY_ID) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
          <Link href={`/catering/quotation-requests/whatsapp${query}`} className="rounded-lg bg-primary px-4 py-2 text-[13.5px] font-bold text-white">
            + Import from WhatsApp (Signature Solution)
          </Link>
          <span className="text-[12.5px] text-text-secondary">Paste the Boss&apos;s WhatsApp message: the AI fills in a quotation request, JDT match dates or a JDT training snack request for you to check.</span>
        </div>
      )}

      <MonthFilter />

      <ListFilters keep={{ company: sp.company, month: range ? sp.month : undefined }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/catering/quotation-requests?${new URLSearchParams({ ...(sp.company ? { company: sp.company } : {}), ...(range && sp.month ? { month: sp.month } : {}) }).toString()}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Request ID, customer, event, agent" className={`${FILTER_INPUT} w-64`} />
        </FilterField>
        <FilterField label="Sales agent">
          <Select name="agent" defaultValue={sp.agent ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All</option>
            {SALES_AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All statuses</option>
            {Object.entries(TRACKING_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Event date from">
          <input type="date" name="eventFrom" defaultValue={sp.eventFrom ?? ""} className={FILTER_INPUT} />
        </FilterField>
        <FilterField label="to">
          <input type="date" name="eventTo" defaultValue={sp.eventTo ?? ""} className={FILTER_INPUT} />
        </FilterField>
        <FilterField label="Submitted from">
          <input type="date" name="sentFrom" defaultValue={sp.sentFrom ?? ""} className={FILTER_INPUT} />
        </FilterField>
        <FilterField label="to">
          <input type="date" name="sentTo" defaultValue={sp.sentTo ?? ""} className={FILTER_INPUT} />
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">
          {requests.length} request{requests.length === 1 ? "" : "s"}
          {monthLabel && <span className="ml-2 font-semibold text-text-secondary">· {monthLabel}</span>}
          {waiting > 0 && <span className="ml-2 font-semibold text-primary">· {waiting} new</span>}
        </div>
        {error ? (
          <div className="px-5 py-4 text-[13px] text-danger">Could not load the requests. Please refresh the page.</div>
        ) : requests.length === 0 ? (
          <EmptyRow text={filtered ? "No quotation requests match these filters." : monthLabel ? "No quotation requests in this month." : "No quotation requests yet."} />
        ) : (
          <div className="overflow-x-auto">
            {/* related details share a column (ID + submitted, customer + contact, event + date, status + handler) so nothing is squeezed */}
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="bg-surface-alt text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <tr>
                  {["Request", "Customer", "Event", "Pax / service", "Sales agent", "Status", "Last updated", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((r) => {
                  const days = (r.days as unknown as EventDay[]) ?? [];
                  const services = Array.from(new Set(days.map((d) => SERVICE_TYPE_LABEL[d.serviceType] ?? d.serviceType).filter(Boolean)));
                  const pax = days.reduce((m, d) => Math.max(m, dayPax(d)), 0);
                  const href = `/catering/quotation-requests/${r.id}${query}`;
                  const isNew = r.tracking_status === "new_request";
                  return (
                    <tr key={r.id} className={`align-top hover:bg-surface-alt/60 ${isNew ? "bg-info-bg/40" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={href} className="font-extrabold text-primary">{r.request_code ?? "—"}</Link>
                        <div className="mt-0.5 text-[11.5px] text-text-muted">{formatMalaysiaDateTime(r.created_at)}</div>
                      </td>
                      <td className="min-w-[180px] px-4 py-3">
                        <div className="font-semibold text-text">{r.customer_name}</div>
                        <div className="mt-0.5 text-[11.5px] text-text-muted">
                          {[r.pic_name, companies.length > 1 ? r.companies?.name : null].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="min-w-[220px] px-4 py-3">
                        <div className="text-text">{r.event_name}</div>
                        <div className="mt-0.5 whitespace-nowrap text-[11.5px] text-text-muted">
                          {days[0]?.dayDate ? formatMalaysiaDate(`${days[0].dayDate}T00:00:00+08:00`) : "No date"}
                          {days.length > 1 ? ` · ${days.length} days` : ""}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-semibold text-text">{pax ? `${pax} pax` : "—"}</div>
                        <div className="mt-0.5 text-[11.5px] text-text-muted">{services.join(", ") || "—"}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{r.sales_agent}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge tone={TRACKING_STATUS_TONE[r.tracking_status] ?? "neutral"}>{TRACKING_STATUS_LABEL[r.tracking_status] ?? r.tracking_status}</StatusBadge>
                        <div className="mt-1 text-[11.5px] text-text-muted">{r.handler?.full_name ? `Handled by ${r.handler.full_name}` : "Not assigned"}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-text-secondary">{r.updated_at ? formatMalaysiaDateTime(r.updated_at) : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={href} className="inline-block whitespace-nowrap rounded-lg border border-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-primary hover:text-white">
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NoAccess() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
      <div className="text-[16px] font-extrabold text-text">Quotation Request Inbox</div>
      <p className="mt-2 text-[13px] text-text-secondary">Only Ms. Nabilah, Mr. Adlan and Ms. Penny can open the quotation requests sent by sales agents.</p>
    </div>
  );
}
