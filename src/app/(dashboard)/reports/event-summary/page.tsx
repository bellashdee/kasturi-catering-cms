import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { formatCurrency } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { buildReportRows } from "@/lib/reports/buildRows";
import { EVENT_MAY_REVENUE, EVENT_ROWS, type EventCompany, type EventRow, type EventStatus } from "@/lib/invoiceListing/events";
import { Select } from "@/components/ui/Select";
import { PrintButton } from "@/components/reports/PrintButton";
import { ReportTable } from "@/components/reports/ReportTable";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { SoftPage } from "@/components/ui/Soft";

const YEAR = 2026;
const MONTHS = [6, 7, 8, 9];
/** Which of the sheet's companies belong to each company of the system: K is Kasturi Indah; SSC (JDT game match) and SS are Signature Solution. */
const ENTITIES_OF: Record<string, EventCompany[]> = { "Kasturi Indah": ["K"], "Signature Solution": ["SSC", "SS"] };
const COMPANY_LABEL: Record<EventCompany, string> = { K: "Kasturi Indah Sdn Bhd", SSC: "Signature Solution Catering", SS: "Signature Solution Sdn Bhd" };
const SERVING_LABEL: Record<string, string> = {
  B: "Buffet",
  P: "Pack food",
  BP: "Buffet pack",
  "B&D": "Buffet & dome set",
  "D&B": "Buffet & dome set",
  PP: "Preplated",
  "PP+P": "Preplated & pack food",
  D: "Dome set",
  "B&P": "Buffet & pack food",
  "P&D": "Pack food & dome set",
  C: "Canape",
};
const STATUS_LABEL: Record<EventStatus, string> = { PAID: "Paid", UNPAID: "Not paid", PARTIAL: "Part paid", NIL: "No charge" };
const STATUS_TONE: Record<EventStatus, "success" | "warning" | "danger" | "neutral"> = { PAID: "success", UNPAID: "danger", PARTIAL: "warning", NIL: "neutral" };

const revenueOf = (rows: EventRow[]) => rows.reduce((t, r) => t + r[6], 0);
const outstandingOf = (r: EventRow) => (r[7] === "UNPAID" ? r[6] : r[7] === "PARTIAL" ? r[8] : 0);
const pct = (now: number, before: number) => (before > 0 ? `${now >= before ? "increased" : "decreased"} by ${Math.abs(((now - before) / before) * 100).toFixed(2)}%` : null);

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
 * Event Summary Report: the "Summary Payment - Event" sheet of each month (Jun - Sep 2026) as a report — every event with its company
 * (K / SSC / SS), type of serving, revenue and payment status, plus the month's totals. Finance / Admin only.
 */
export default async function EventSummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; company?: string; entity?: string; status?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { month: monthParam, company: requestedId, entity: entityParam, status: statusParam } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";
  const back = <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>;
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name");
  const admins = await adminCompanyIds(supabase, (companies ?? []).map((c) => c.id));
  if (admins.length === 0) {
    return (
      <SoftPage>
        {back}
        <EmptyRow text="The event summary holds every customer's revenue and is only available to Finance / Admin users." />
      </SoftPage>
    );
  }

  // the events of the company chosen at the top: Signature Solution has SSC and SS, Kasturi Indah has K, O2 Life none; all companies shows every one
  const { targetCompanyIds } = resolveCompanyScope(session, companies ?? [], requestedId);
  const nameOf = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const allowed = new Set<EventCompany>(targetCompanyIds.flatMap((id) => ENTITIES_OF[nameOf.get(id) ?? ""] ?? []));
  const allEntities = (Object.keys(COMPANY_LABEL) as EventCompany[]).every((e) => allowed.has(e));
  const scopedRows = EVENT_ROWS.filter((r) => allowed.has(r[4]));
  if (allowed.size === 0) {
    return (
      <SoftPage>
        {back}
        <EmptyRow text="There are no events in the Summary Payment sheets for this company. Choose Kasturi Indah or Signature Solution at the top." />
      </SoftPage>
    );
  }

  const month = MONTHS.includes(Number(monthParam)) ? Number(monthParam) : MONTHS[MONTHS.length - 1];
  const company = entityParam && entityParam in COMPANY_LABEL && allowed.has(entityParam as EventCompany) ? (entityParam as EventCompany) : "";
  const status = statusParam && statusParam in STATUS_LABEL ? (statusParam as EventStatus) : "";

  const monthRows = scopedRows.filter((r) => r[0] === month);
  const rows = monthRows.filter((r) => (!company || r[4] === company) && (!status || r[7] === status));
  const monthRevenue = revenueOf(monthRows);
  // the May figure on the June sheet is for all the companies together, so it is only compared when all of them are shown
  const previous = month === 6 ? (allEntities ? EVENT_MAY_REVENUE : 0) : revenueOf(scopedRows.filter((r) => r[0] === month - 1));
  const change = pct(monthRevenue, previous);
  const unpaid = monthRows.reduce((t, r) => t + outstandingOf(r), 0);
  const periodLabel = `${MONTH_LABEL[month - 1]} ${YEAR}`;

  const byCompany = (Object.keys(COMPANY_LABEL) as EventCompany[]).filter((c) => allowed.has(c)).map((c) => {
    const list = monthRows.filter((r) => r[4] === c);
    return { label: COMPANY_LABEL[c], value: revenueOf(list), note: `${list.length} event${list.length === 1 ? "" : "s"}` };
  });
  const serving = new Map<string, number>();
  for (const r of rows) {
    const label = SERVING_LABEL[r[5]] ?? r[5];
    serving.set(label, (serving.get(label) ?? 0) + r[6]);
  }
  const byServing = Array.from(serving.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "date", label: "Date", exportValue: (r: EventRow) => `${String(r[1]).padStart(2, "0")}/${String(r[0]).padStart(2, "0")}/${YEAR}` },
      { key: "event", label: "Name of Event", exportValue: (r: EventRow) => r[2] },
      { key: "pax", label: "No of Pax", exportValue: (r: EventRow) => r[3] },
      { key: "com", label: "Company", exportValue: (r: EventRow) => r[4] },
      { key: "serving", label: "Type of Serving", exportValue: (r: EventRow) => SERVING_LABEL[r[5]] ?? r[5] },
      { key: "revenue", label: "Revenue (RM)", exportValue: (r: EventRow) => r[6], display: (r: EventRow) => formatCurrency(r[6]) },
      {
        key: "status",
        label: "Payment",
        exportValue: (r: EventRow) => (r[7] === "PARTIAL" ? `${STATUS_LABEL[r[7]]} (RM ${r[8].toFixed(2)} owed)` : STATUS_LABEL[r[7]]),
        display: (r: EventRow) => (
          <StatusBadge tone={STATUS_TONE[r[7]]}>{r[7] === "PARTIAL" ? `${STATUS_LABEL[r[7]]} · ${formatCurrency(r[8])} owed` : STATUS_LABEL[r[7]]}</StatusBadge>
        ),
      },
    ],
    (r) => `${r[0]}-${r[1]}-${r[2]}-${r[6]}-${r[3]}-${rows.indexOf(r)}`,
  );

  return (
    <SoftPage>
      <div>
        {back}
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Event Summary — {periodLabel}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          From the monthly Summary Payment - Event sheet. K = Kasturi Indah, SSC = Signature Solution Catering, SS = Signature Solution Sdn Bhd.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <form method="get" className="flex flex-wrap items-end gap-3">
          {requestedId && <input type="hidden" name="company" value={requestedId} />}
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">Month</label>
            <Select name="month" defaultValue={month} className="mt-1 h-9 w-40 rounded-lg border border-border-strong px-2 text-[13px]">
              {MONTHS.map((m) => <option key={m} value={m}>{MONTH_LABEL[m - 1]} {YEAR}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">Company</label>
            <Select name="entity" defaultValue={company} className="mt-1 h-9 w-56 rounded-lg border border-border-strong px-2 text-[13px]">
              <option value="">All Companies</option>
              {(Object.keys(COMPANY_LABEL) as EventCompany[]).filter((c) => allowed.has(c)).map((c) => <option key={c} value={c}>{c} · {COMPANY_LABEL[c]}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">Payment</label>
            <Select name="status" defaultValue={status} className="mt-1 h-9 w-40 rounded-lg border border-border-strong px-2 text-[13px]">
              <option value="">All</option>
              {(Object.keys(STATUS_LABEL) as EventStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </div>
          <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
        </form>
        <PrintButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Revenue · ${periodLabel}`} value={formatCurrency(monthRevenue)} sub={change ? `${change} from ${month === 6 ? "May (per the June sheet)" : MONTH_LABEL[month - 2]}` : undefined} />
        <Stat label="Paid" value={formatCurrency(monthRevenue - unpaid)} />
        <Stat label="Not yet paid" value={formatCurrency(unpaid)} sub={unpaid > 0 ? "Not paid or part paid events" : "Everything is paid"} />
        <Stat label="Events · pax" value={`${monthRows.length} · ${monthRows.reduce((t, r) => t + r[3], 0).toLocaleString("en-MY")}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Revenue by Company — ${periodLabel}`}>
          <Bars items={byCompany} />
        </SectionCard>
        <SectionCard title={`Revenue by Type of Serving${company || status ? " (filtered)" : ""}`}>
          {byServing.length === 0 ? <EmptyRow text="No events for this filter." /> : <Bars items={byServing} />}
        </SectionCard>
      </div>

      <SectionCard title="Month by Month">
        <Bars items={MONTHS.map((m) => ({ label: `${MONTH_LABEL[m - 1]} ${YEAR}`, value: revenueOf(scopedRows.filter((r) => r[0] === m)) }))} />
      </SectionCard>

      <ReportTable filenameBase={`event-summary-${YEAR}-${month}`} headers={headers} rows={tableRows} emptyText="No events for this filter." />
    </SoftPage>
  );
}
