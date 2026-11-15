import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { invoicePaid, invoiceTotal } from "@/lib/finance/outstanding";
import { EVENT_STATUS_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { buildReportRows } from "@/lib/reports/buildRows";
import { PrintButton } from "@/components/reports/PrintButton";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { DonutChart, MonthColumns, RED } from "@/components/reports/Charts";
import { SoftPage } from "@/components/ui/Soft";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Event date", event: "Event name", customer: "Customer", revenue: "Revenue", payment: "Payment status" };

type Entity = "K" | "SSC" | "SS" | "O2";
const ENTITY_LABEL: Record<Entity, string> = { K: "Kasturi Indah Sdn Bhd", SSC: "Signature Solution Catering", SS: "Signature Solution Sdn Bhd", O2: "O2 Life Sdn Bhd" };
type Pay = "none" | "unpaid" | "part" | "paid";
const PAY_LABEL: Record<Pay, string> = { none: "Not invoiced yet", unpaid: "Invoiced, not paid", part: "Part paid", paid: "Paid" };
const PAY_TONE: Record<Pay, "neutral" | "danger" | "warning" | "success"> = { none: "neutral", unpaid: "danger", part: "warning", paid: "success" };
const PAY_ORDER: Pay[] = ["paid", "part", "unpaid", "none"];
const PAY_COLOR: Record<Pay, string> = { paid: "#2e9e6b", part: "#e0a030", unpaid: RED, none: "#8a8f98" };

/** The company of the sheet: Kasturi Indah is K; Signature Solution is SSC for the JDT game match events and SS for the rest. */
function entityOf(companyName: string | undefined, eventName: string, customerName: string | undefined): Entity {
  if (companyName === "Kasturi Indah") return "K";
  if (companyName === "O2 Life") return "O2";
  return /\bJDT\b/i.test(`${eventName} ${customerName ?? ""}`) ? "SSC" : "SS";
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="mt-1 text-[22px] font-extrabold leading-tight text-text">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-text-secondary">{sub}</div>}
    </div>
  );
}

function Bars({ items }: { items: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 break-words font-semibold text-text">{i.label}{i.note && <span className="font-normal text-text-secondary"> · {i.note}</span>}</span>
            <span className="shrink-0 font-bold tabular-nums text-text">{formatCurrency(i.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full" style={{ background: "var(--color-info-bg)" }}>
            <div className="h-2 rounded-full" style={{ width: `${max > 0 ? Math.max((i.value / max) * 100, 1.5) : 0}%`, background: "var(--color-navy-700)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Event Summary Report: the events of the Catering module (the events keyed in, with their customer, type of serving, revenue and status) by month,
 * with whether each one is invoiced and paid, from the invoices linked to the event. Finance / Admin only.
 */
export default async function EventSummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; category?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name");
  const sp = await searchParams;
  const { company: requestedId, year: yearParam, month: monthParam, category: entityParam, status: statusParam } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "asc");
  const query = requestedId ? `?company=${requestedId}` : "";
  const back = <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>;

  const { targetCompanyIds } = resolveCompanyScope(session, companies ?? [], requestedId);
  const admins = await adminCompanyIds(supabase, targetCompanyIds);
  if (admins.length === 0) {
    return (
      <SoftPage>
        {back}
        <EmptyRow text="The event summary holds every customer's revenue and is only available to Finance / Admin users." />
      </SoftPage>
    );
  }

  const now = malaysiaYearMonth();
  const year = Number(yearParam) || now.year;
  const month = monthParam === undefined ? now.month : Math.min(Math.max(Number(monthParam) || 0, 0), 12);
  const nameOf = new Map((companies ?? []).map((c) => [c.id, c.name]));

  const { data: events, error } = await supabase
    .from("catering_events")
    .select("id, company_id, event_name, event_date, pax_count, service_type, total_amount, status, customers(name), customer_invoices(amount, tax_amount, status, customer_payments(amount))")
    .in("company_id", admins)
    .gte("event_date", `${year}-01-01`)
    .lte("event_date", `${year}-12-31`)
    .order("event_date")
    .order("event_name");
  if (error) throw error;

  const all = (events ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => {
      const invoices = (e.customer_invoices ?? []).filter((i) => i.status !== "draft" && i.status !== "pending_review");
      const total = invoices.reduce((t, i) => t + invoiceTotal(i), 0);
      const paid = invoices.reduce((t, i) => t + invoicePaid(i), 0);
      const pay: Pay = invoices.length === 0 ? "none" : paid >= total - 0.005 ? "paid" : paid > 0 ? "part" : "unpaid";
      return { ...e, entity: entityOf(nameOf.get(e.company_id), e.event_name, e.customers?.name), revenue: Number(e.total_amount ?? 0), pay };
    });

  const allowed = Array.from(new Set(all.map((e) => e.entity)));
  const entityFilter = (allowed as string[]).includes(entityParam ?? "") ? (entityParam as Entity) : "";
  const status = statusParam && statusParam in EVENT_STATUS_LABEL ? statusParam : "";
  const inMonth = (date: string) => !month || Number(date.slice(5, 7)) === month;
  const monthRows = all.filter((e) => inMonth(e.event_date) && (!entityFilter || e.entity === entityFilter));
  const rows = sortBy(monthRows.filter((e) => !status || e.status === status), sort, dir, {
    date: [(r) => r.event_date, (r) => r.event_name],
    event: [(r) => r.event_name, (r) => r.event_date],
    customer: [(r) => r.customers?.name, (r) => r.event_date],
    revenue: (r) => r.revenue,
    payment: [(r) => PAY_LABEL[r.pay], (r) => r.event_date],
  });
  const sum = (list: { revenue: number }[]) => list.reduce((t, e) => t + e.revenue, 0);
  const periodLabel = month ? `${MONTH_LABEL[month - 1]} ${year}` : String(year);

  const byEntity = allowed.map((k) => {
    const list = monthRows.filter((e) => e.entity === k);
    return { label: ENTITY_LABEL[k], value: sum(list), note: `${list.length} event${list.length === 1 ? "" : "s"}` };
  });
  const serving = new Map<string, number>();
  for (const e of rows) {
    const label = e.service_type ? SERVICE_TYPE_LABEL[e.service_type] ?? e.service_type : "Not stated";
    serving.set(label, (serving.get(label) ?? 0) + e.revenue);
  }
  const byServing = Array.from(serving.entries()).map(([label, value]) => ({ label, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  // the year month by month, each month split by payment status (the company filter applies, the month and event status do not)
  const yearRows = all.filter((e) => !entityFilter || e.entity === entityFilter);
  const byMonth = PAY_ORDER.map((p) => ({
    label: PAY_LABEL[p],
    color: PAY_COLOR[p],
    values: MONTH_LABEL.map((_, i) => sum(yearRows.filter((e) => e.pay === p && Number(e.event_date.slice(5, 7)) === i + 1))),
  }));
  const byPay = PAY_ORDER.map((p) => {
    const list = monthRows.filter((e) => e.pay === p);
    return { label: PAY_LABEL[p], value: sum(list), color: PAY_COLOR[p], note: `${list.length} event${list.length === 1 ? "" : "s"}` };
  });
  const notInvoiced = monthRows.filter((e) => e.pay === "none");

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "date", label: "Date", exportValue: (r) => `${r.event_date.slice(8, 10)}/${r.event_date.slice(5, 7)}/${r.event_date.slice(0, 4)}` },
      { key: "event", label: "Name of Event", exportValue: (r) => r.event_name },
      { key: "customer", label: "Customer", exportValue: (r) => r.customers?.name ?? "—" },
      { key: "pax", label: "No of Pax", exportValue: (r) => r.pax_count ?? 0 },
      { key: "com", label: "Company", exportValue: (r) => r.entity },
      { key: "serving", label: "Type of Serving", exportValue: (r) => (r.service_type ? SERVICE_TYPE_LABEL[r.service_type] ?? r.service_type : "—") },
      { key: "revenue", label: "Revenue (RM)", exportValue: (r) => r.revenue, display: (r) => formatCurrency(r.revenue) },
      { key: "event_status", label: "Event", exportValue: (r) => EVENT_STATUS_LABEL[r.status] ?? r.status },
      { key: "pay", label: "Payment", exportValue: (r) => PAY_LABEL[r.pay], display: (r) => <StatusBadge tone={PAY_TONE[r.pay]}>{PAY_LABEL[r.pay]}</StatusBadge> },
    ],
    (r) => r.id,
  );

  return (
    <SoftPage>
      <div>
        {back}
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Event Summary — {periodLabel}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          The events keyed in the Catering module. K = Kasturi Indah, SSC = Signature Solution Catering (JDT game match), SS = Signature Solution Sdn Bhd. Payment is from the invoices linked to the event.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <ReportFilterBar
          path="/reports/event-summary"
          sortOptions={SORTS}
          sort={sort}
          dir={dir}
          requestedCompanyId={requestedId}
          year={year}
          month={month}
          monthAll
          showRange={false}
          category={entityFilter}
          categoryLabel="Company"
          categoryAllLabel="All Companies"
          categoryOptions={allowed.map((k) => ({ value: k, label: `${k} · ${ENTITY_LABEL[k]}` }))}
          status={status}
          statusOptions={Object.entries(EVENT_STATUS_LABEL).filter(([v]) => v !== "cancelled").map(([value, label]) => ({ value, label }))}
        />
        <PrintButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Revenue · ${periodLabel}`} value={formatCurrency(sum(monthRows))} sub="Events keyed in Catering, cancelled left out" />
        <Stat label="Events · pax" value={`${monthRows.length} · ${monthRows.reduce((t, e) => t + (e.pax_count ?? 0), 0).toLocaleString("en-MY")}`} />
        <Stat label="Paid" value={formatCurrency(sum(monthRows.filter((e) => e.pay === "paid")))} sub={`${monthRows.filter((e) => e.pay === "paid").length} event${monthRows.filter((e) => e.pay === "paid").length === 1 ? "" : "s"}`} />
        <Stat label="Not invoiced yet" value={formatCurrency(sum(notInvoiced))} sub={`${notInvoiced.length} event${notInvoiced.length === 1 ? "" : "s"} with no invoice linked`} />
      </div>

      <SectionCard title={`Payment Status — ${periodLabel}`}>
        <DonutChart slices={byPay} centerLabel="Revenue" empty="No events with revenue for this period." />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Revenue by Company — ${periodLabel}`}>
          {byEntity.length === 0 ? <EmptyRow text="No events for this period." /> : <Bars items={byEntity} />}
        </SectionCard>
        <SectionCard title={`Revenue by Type of Serving${entityFilter || status ? " (filtered)" : ""}`}>
          {byServing.length === 0 ? <EmptyRow text="No events with revenue for this filter." /> : <Bars items={byServing} />}
        </SectionCard>
      </div>

      <SectionCard title={`Month by Month — ${year}`}>
        <p className="mb-3 text-[12.5px] text-text-secondary">The revenue of the events of each month, split by whether the invoice is paid.</p>
        <MonthColumns series={byMonth} empty="No events with revenue this year." />
      </SectionCard>

      <ReportTable filenameBase={`event-summary-${year}-${month || "all"}`} headers={headers} rows={tableRows} emptyText="No events for this filter." />
    </SoftPage>
  );
}
