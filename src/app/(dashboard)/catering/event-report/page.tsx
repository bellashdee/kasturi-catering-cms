import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { DonutChart, RED } from "@/components/reports/Charts";
import { RankBars } from "@/components/reports/RankBars";
import { StatusBadge } from "@/components/StatusBadge";
import { Select } from "@/components/ui/Select";
import { EVENT_STATUS_LABEL, SALES_AGENTS } from "@/lib/catering/constants";
import { eventPnlCompanyIds, listEventPnlRange } from "@/lib/finance/eventPnlQueries";
import { formatMargin, round2, VERDICT_LABEL, VERDICT_TONE } from "@/lib/finance/eventPnl";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatRM } from "@/lib/finance/payments";
import { todayInMalaysia } from "@/lib/format";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

type Search = { company?: string; period?: string; year?: string; month?: string; week?: string; customer?: string; agent?: string; status?: string; sort?: string; dir?: string };

const SORTS = { date: "Event date", customer: "Customer", reference: "Event reference", event: "Event name", agent: "Sales agent", status: "Status", profit: "Net profit" };
const STATUS_ORDER = Object.keys(EVENT_STATUS_LABEL);

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Booked events: Confirmed (and later, In Production / Delivered), Completed and Cancelled are counted apart; quotation requests are never events. */
const CONFIRMED = ["confirmed", "in_production", "delivered"];

/**
 * Event Management report: the events of a week, a month or a year with their actual Profit & Loss (only the revenue and costs saved
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

  // the period: a week of the month (Week 1 = days 1-7 ... Week 4 = day 22 to the end of the month), a month or a year (Malaysia time)
  const today = todayInMalaysia();
  const [nowY, nowM, nowD] = today.split("-").map(Number);
  const period = sp.period === "week" || sp.period === "year" ? sp.period : "month";
  const year = Number(sp.year) >= 2000 && Number(sp.year) <= 2100 ? Number(sp.year) : nowY;
  const month = Math.min(12, Math.max(1, Number(sp.month) || nowM));
  const week = Math.min(4, Math.max(1, Number(sp.week) || (year === nowY && month === nowM ? Math.min(4, Math.ceil(nowD / 7)) : 1)));
  const [fromM, toM] = period === "year" ? [1, 12] : [month, month];
  const weekFrom = (week - 1) * 7 + 1;
  const weekTo = week === 4 ? lastDay(year, month) : week * 7;
  const start = period === "week" ? `${year}-${pad(month)}-${pad(weekFrom)}` : `${year}-${pad(fromM)}-01`;
  const end = period === "week" ? `${year}-${pad(month)}-${pad(weekTo)}` : `${year}-${pad(toM)}-${pad(lastDay(year, toM))}`;
  const periodLabel = period === "year" ? String(year) : period === "week" ? `Week ${week}, ${MONTH_LABEL[month - 1]} ${year} (${weekFrom}–${weekTo})` : `${MONTH_LABEL[month - 1]} ${year}`;

  const status = sp.status && EVENT_STATUS_LABEL[sp.status] ? sp.status : undefined;
  const agent = sp.agent && SALES_AGENTS.includes(sp.agent) ? sp.agent : undefined;
  const { sort, dir } = readSort(sp, SORTS, "date", "asc");
  const loaded = await listEventPnlRange(supabase, allowedIds, start, end, { customer: sp.customer, status, salesAgent: agent });
  const rows = sortBy(loaded, sort, dir, {
    date: [(r) => r.eventDate, (r) => r.eventName],
    customer: [(r) => r.customerName, (r) => r.eventDate],
    reference: [(r) => r.autoCountNos[0] ?? r.eventReference, (r) => r.eventReference],
    event: [(r) => r.eventName, (r) => r.eventDate],
    agent: [(r) => r.salesAgent, (r) => r.eventDate],
    status: [(r) => STATUS_ORDER.indexOf(r.status), (r) => r.eventDate],
    profit: (r) => r.pnl.netProfit,
  });

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

  // charts: the events by status, and the events with the biggest revenue (the margin beside each; a loss is flagged)
  const STATUS_COLOR: Record<string, string> = { enquiry: "#7fb8e6", quoted: "#8a8f98", confirmed: "#2f7fc1", in_production: "#1e3a5f", delivered: "#b8794a", completed: "#2e9e6b", cancelled: RED };
  const byStatus = STATUS_ORDER.map((k) => ({ label: EVENT_STATUS_LABEL[k], value: rows.filter((r) => r.status === k).length, color: STATUS_COLOR[k] }));
  const topEvents = [...counted]
    .filter((r) => r.pnl.netRevenue > 0)
    .sort((a, b) => b.pnl.netRevenue - a.pnl.netRevenue)
    .slice(0, 10)
    .map((r) => ({ label: r.eventName, value: r.pnl.netRevenue, note: `margin ${formatMargin(r.pnl.margin)}`, flag: r.pnl.netProfit < 0 ? "Loss" : undefined }));

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

      <ListFilters keep={{ company: sp.company }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={sp.company ? `/catering/event-report?company=${sp.company}` : "/catering/event-report"}>
        <FilterField label="Period">
          <Select name="period" defaultValue={period} className={`${FILTER_INPUT} w-32`}>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </Select>
        </FilterField>
        <FilterField label="Month">
          <Select name="month" defaultValue={String(month)} className={`${FILTER_INPUT} w-36`}>
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Week">
          <Select name="week" defaultValue={String(week)} className={`${FILTER_INPUT} w-32`}>
            {[1, 2, 3, 4].map((w) => <option key={w} value={w}>Week {w}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Year">
          <input type="number" name="year" defaultValue={year} className={`${FILTER_INPUT} w-24`} />
        </FilterField>
        <FilterField label="Customer">
          <input name="customer" defaultValue={sp.customer ?? ""} placeholder="Name contains" className={`${FILTER_INPUT} w-44`} />
        </FilterField>
        <FilterField label="Sales agent">
          <Select name="agent" defaultValue={agent ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All</option>
            {SALES_AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Event status">
          <Select name="status" defaultValue={status ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All statuses</option>
            {Object.entries(EVENT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

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

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="Events by Status">
            <DonutChart slices={byStatus} centerLabel="Events" unit="count" empty="No events in this period." />
          </SectionCard>
          <SectionCard title="Biggest Events by Revenue (top 10)">
            <RankBars items={topEvents} total={revenue} empty="No event revenue recorded on the P&L yet." />
          </SectionCard>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {rows.length === 0 ? (
          <EmptyRow text={`No events in ${periodLabel} match these filters.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-[13px]">
              <thead className="bg-surface-alt text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <tr>
                  {["Date", "Event", "Sales agent", "Status", "Revenue", "Costs", "Net profit", "Margin", ""].map((h) => (
                    <th key={h} className={`whitespace-nowrap px-4 py-3 ${["Revenue", "Costs", "Net profit", "Margin"].includes(h) ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-surface-alt/60">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-semibold text-text">{r.eventDate}</div>
                      <div className="mt-0.5 text-[11.5px] text-text-muted">{r.autoCountNos.length > 0 ? `${r.autoCountNos.join(", ")} · ${r.eventReference ?? ""}` : r.eventReference ?? "—"}</div>
                    </td>
                    <td className="min-w-[220px] px-4 py-3">
                      <Link href={`/catering/${r.id}`} className="font-semibold text-primary">{r.eventName}</Link>
                      <div className="mt-0.5 text-[11.5px] text-text-muted">{r.customerName ?? "No customer"}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{r.salesAgent ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div>{EVENT_STATUS_LABEL[r.status] ?? r.status}</div>
                      <div className="mt-1"><StatusBadge tone={VERDICT_TONE[r.pnl.verdict]}>{VERDICT_LABEL[r.pnl.verdict]}</StatusBadge></div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatRM(r.pnl.netRevenue)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatRM(round2(r.pnl.directCosts + r.pnl.additionalExpenses))}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${r.pnl.netProfit < 0 ? "text-danger" : "text-text"}`}>{formatRM(r.pnl.netProfit)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatMargin(r.pnl.margin)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/finance/event-pnl/${r.id}`} className="inline-block whitespace-nowrap rounded-lg border border-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-primary hover:text-white">
                        Open P&amp;L
                      </Link>
                    </td>
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
