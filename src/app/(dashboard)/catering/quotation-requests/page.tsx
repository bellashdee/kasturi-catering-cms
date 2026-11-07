import Link from "next/link";
import { redirect } from "next/navigation";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SALES_AGENTS, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { dayPax, type EventDay } from "@/lib/catering/days";
import { TRACKING_STATUS_LABEL, TRACKING_STATUS_TONE } from "@/lib/catering/quotationRequest";
import { formatMalaysiaDate, formatMalaysiaDateTime } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { MonthFilter } from "@/components/MonthFilter";
import { monthLabelOf, monthRange } from "@/lib/monthFilter";

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
  month?: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const inputClass = "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] outline-none focus:border-primary";

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
  const { data: rows, error } = await request.order("created_at", { ascending: sp.sort === "oldest" }).limit(300);
  const requests = rows ?? [];
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

      <MonthFilter />

      <form className="flex flex-wrap items-end gap-2.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
        {sp.company && <input type="hidden" name="company" value={sp.company} />}
        {range && <input type="hidden" name="month" value={sp.month} />}
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          Search
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Request ID, customer, event, agent" className={`${inputClass} w-64`} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          Sales agent
          <Select name="agent" defaultValue={sp.agent ?? ""} className={inputClass}>
            <option value="">All</option>
            {SALES_AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          Status
          <Select name="status" defaultValue={sp.status ?? ""} className={inputClass}>
            <option value="">All</option>
            {Object.entries(TRACKING_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          Event date from
          <input type="date" name="eventFrom" defaultValue={sp.eventFrom ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          to
          <input type="date" name="eventTo" defaultValue={sp.eventTo ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          Submitted from
          <input type="date" name="sentFrom" defaultValue={sp.sentFrom ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          to
          <input type="date" name="sentTo" defaultValue={sp.sentTo ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-text-secondary">
          Sort
          <Select name="sort" defaultValue={sp.sort === "oldest" ? "oldest" : "newest"} className={inputClass}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </Select>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply</button>
        <Link href={`/catering/quotation-requests${query}`} className="h-9 rounded-lg border border-border-strong px-3 text-[13px] font-semibold leading-9 text-text">
          Clear
        </Link>
      </form>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">
          {requests.length} request{requests.length === 1 ? "" : "s"}
          {monthLabel && <span className="ml-2 font-semibold text-text-secondary">· {monthLabel}</span>}
          {waiting > 0 && <span className="ml-2 font-semibold text-primary">· {waiting} new</span>}
        </div>
        {error ? (
          <div className="px-5 py-4 text-[13px] text-danger">Could not load the requests. Please refresh the page.</div>
        ) : requests.length === 0 ? (
          <EmptyRow text={monthLabel ? "No quotation request in this month matches." : "No quotation request matches."} />
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
