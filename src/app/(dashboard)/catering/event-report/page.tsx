import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Select } from "@/components/ui/Select";
import { EVENT_STATUS_LABEL, SALES_AGENTS } from "@/lib/catering/constants";
import { eventPnlCompanyIds, listEventPnlRange } from "@/lib/finance/eventPnlQueries";
import { formatMargin, round2, VERDICT_LABEL, VERDICT_TONE } from "@/lib/finance/eventPnl";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatRM } from "@/lib/finance/payments";
import { todayInMalaysia } from "@/lib/format";

type Search = { company?: string; period?: string; year?: string; month?: string; quarter?: string; customer?: string; agent?: string; status?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const inputClass = "mt-1 h-9 rounded-lg border border-border-strong bg-surface px-2 text-[13px]";

/** Booked events: Confirmed (and later, In Production / Delivered), Completed and Cancelled are counted apart; quotation requests are never events. */
const CONFIRMED = ["confirmed", "in_production", "delivered"];

/**
 * Event Management report: the events of a month, a quarter or a year with their actual Profit & Loss (only the revenue and costs saved
 * on each event's P&L; nothing is estimated). Finance / Admin and the Quotation Request Inbox people can open it.
 */
export default async function EventReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const allowedIds = await eventPnlCompanyIds(supabase, targetCompanyIds);

  const header = (
    <>
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Event Management Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Confirmed, completed and cancelled events with their actual Profit &amp; Loss. Only the revenue and costs recorded on each event count; quotation requests and
          quotations not yet issued are never included.
        </p>
      </div>
      <CateringSubNav />
    </>
  );

  if (allowedIds.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="The Event Management Report shows confidential event figures: only Finance / Admin users, Ms. Nabilah, Mr. Adlan and Ms. Penny can open it." />
      </div>
    );
  }

  // the period: a month, a quarter or a year (Malaysia time)
  const today = todayInMalaysia();
  const [nowY, nowM] = today.split("-").map(Number);
  const period = sp.period === "quarter" || sp.period === "year" ? sp.period : "month";
  const year = Number(sp.year) >= 2000 && Number(sp.year) <= 2100 ? Number(sp.year) : nowY;
  const month = Math.min(12, Math.max(1, Number(sp.month) || nowM));
  const quarter = Math.min(4, Math.max(1, Number(sp.quarter) || Math.ceil(nowM / 3)));
  const [fromM, toM] = period === "year" ? [1, 12] : period === "quarter" ? [quarter * 3 - 2, quarter * 3] : [month, month];
  const start = `${year}-${pad(fromM)}-01`;
  const end = `${year}-${pad(toM)}-${pad(lastDay(year, toM))}`;
  const periodLabel = period === "year" ? String(year) : period === "quarter" ? `Q${quarter} ${year}` : `${MONTH_LABEL[month - 1]} ${year}`;

  const status = sp.status && EVENT_STATUS_LABEL[sp.status] ? sp.status : undefined;
  const agent = sp.agent && SALES_AGENTS.includes(sp.agent) ? sp.agent : undefined;
  const rows = await listEventPnlRange(supabase, allowedIds, start, end, { customer: sp.customer, status, salesAgent: agent });

  const confirmed = rows.filter((r) => CONFIRMED.includes(r.status)).length;
  const completed = rows.filter((r) => r.status === "completed").length;
  const cancelled = rows.filter((r) => r.status === "cancelled").length;
  const upcoming = rows.filter((r) => r.eventDate >= today && r.status !== "cancelled" && r.status !== "completed").length;
  // money: only events that are not cancelled, and only the figures saved on their P&L
  const counted = rows.filter((r) => r.status !== "cancelled");
  const revenue = round2(counted.reduce((t, r) => t + r.pnl.netRevenue, 0));
  const costs = round2(counted.reduce((t, r) => t + r.pnl.directCosts + r.pnl.additionalExpenses, 0));
  const profit = round2(revenue - costs);
  const margins = counted.map((r) => r.pnl.margin).filter((m): m is number => m !== null);
  const averageMargin = margins.length > 0 ? margins.reduce((t, m) => t + m, 0) / margins.length : null;
  const overallMargin = revenue === 0 ? null : (profit / revenue) * 100;

  const cards: { label: string; value: string; note?: string }[] = [
    { label: "Confirmed events", value: String(confirmed), note: "Confirmed, In Production, Delivered" },
    { label: "Completed events", value: String(completed) },
    { label: "Cancelled events", value: String(cancelled) },
    { label: "Upcoming events", value: String(upcoming), note: "from today, not cancelled" },
    { label: "Total event revenue", value: formatRM(revenue) },
    { label: "Total event costs", value: formatRM(costs) },
    { label: "Total net profit", value: formatRM(profit) },
    { label: "Average profit margin", value: formatMargin(averageMargin), note: `${margins.length} event(s) with revenue · overall ${formatMargin(overallMargin)}` },
  ];

  return (
    <div className="flex flex-col gap-5">
      {header}

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        {sp.company && <input type="hidden" name="company" value={sp.company} />}
        <label className="text-[12px] font-semibold text-text-secondary">
          Period
          <Select name="period" defaultValue={period} className={`${inputClass} block w-32`}>
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Yearly</option>
          </Select>
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Month <span className="font-normal text-text-muted">(monthly)</span>
          <Select name="month" defaultValue={String(month)} className={`${inputClass} block w-36`}>
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Quarter <span className="font-normal text-text-muted">(quarterly)</span>
          <Select name="quarter" defaultValue={String(quarter)} className={`${inputClass} block w-24`}>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
          </Select>
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Year
          <input type="number" name="year" defaultValue={year} className={`${inputClass} block w-24`} />
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Customer
          <input name="customer" defaultValue={sp.customer ?? ""} placeholder="Name contains" className={`${inputClass} block w-44`} />
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Sales agent
          <Select name="agent" defaultValue={agent ?? ""} className={`${inputClass} block w-40`}>
            <option value="">All</option>
            {SALES_AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </label>
        <label className="text-[12px] font-semibold text-text-secondary">
          Event status
          <Select name="status" defaultValue={status ?? ""} className={`${inputClass} block w-40`}>
            <option value="">All</option>
            {Object.entries(EVENT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Show</button>
      </form>

      <div className="text-[13px] font-bold text-text">{periodLabel} · {rows.length} event{rows.length === 1 ? "" : "s"}</div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{c.label}</div>
            <div className="mt-1 text-xl font-extrabold text-text">{c.value}</div>
            {c.note && <div className="text-[11.5px] text-text-muted">{c.note}</div>}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {rows.length === 0 ? (
          <EmptyRow text={`No events in ${periodLabel} match these filters.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-[12.5px]">
              <thead className="bg-surface-alt text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <tr>
                  {["Date", "Event ID", "Event", "Customer", "Sales agent", "Status", "Revenue", "Costs", "Net profit", "Margin", "P&L", ""].map((h) => (
                    <th key={h} className={`px-3 py-2.5 ${["Revenue", "Costs", "Net profit", "Margin"].includes(h) ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2.5">{r.eventDate}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{r.eventReference ?? "—"}</td>
                    <td className="px-3 py-2.5 font-semibold text-text"><Link href={`/catering/${r.id}`} className="text-primary">{r.eventName}</Link></td>
                    <td className="px-3 py-2.5">{r.customerName ?? "—"}</td>
                    <td className="px-3 py-2.5">{r.salesAgent ?? "—"}</td>
                    <td className="px-3 py-2.5">{EVENT_STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="px-3 py-2.5 text-right">{formatRM(r.pnl.netRevenue)}</td>
                    <td className="px-3 py-2.5 text-right">{formatRM(round2(r.pnl.directCosts + r.pnl.additionalExpenses))}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${r.pnl.netProfit < 0 ? "text-danger" : "text-text"}`}>{formatRM(r.pnl.netProfit)}</td>
                    <td className="px-3 py-2.5 text-right">{formatMargin(r.pnl.margin)}</td>
                    <td className="px-3 py-2.5"><StatusBadge tone={VERDICT_TONE[r.pnl.verdict]}>{VERDICT_LABEL[r.pnl.verdict]}</StatusBadge></td>
                    <td className="px-3 py-2.5"><Link href={`/finance/event-pnl/${r.id}`} className="font-semibold text-primary">Open P&amp;L</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
