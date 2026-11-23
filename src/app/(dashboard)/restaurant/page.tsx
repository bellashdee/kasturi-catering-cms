import Link from "next/link";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { canAccessModule } from "@/lib/modules";
import { formatCurrency, formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { channelLabel, paymentLabel } from "@/lib/restaurant/constants";
import {
  RANGE_LABEL,
  addDays,
  combineDays,
  feedmeExtras,
  fetchCashSessions,
  fetchDayTotals,
  fetchFoodPurchases,
  fetchMonthlyTotal,
  fetchSalesLines,
  groupNet,
  missingDays,
  resolveRange,
  totalsOfDays,
  type RangeKey,
} from "@/lib/restaurant/dashboard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { SPEND_INPUT, SPEND_LABEL } from "@/components/spending/formStyles";

const dayText = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);
const NOT_SPLIT = "__not_split";
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

export default async function RestaurantDashboardPage({ searchParams }: { searchParams: Promise<{ company?: string; range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;

  const today = todayInMalaysia();
  const { key, from, to } = resolveRange(sp.range, sp.from, sp.to, today);
  const monthKey = to.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const monthEnd = addDays(`${addDays(monthStart, 40).slice(0, 7)}-01`, -1);
  const canSeeCosts = canAccessModule(ctx.session.allowedModules, "finance-admin");

  const [rangeLines, monthLines, rangeTotals, monthTotals, cash, foodPurchases, monthlyTotal] = await Promise.all([
    fetchSalesLines(ctx.db, ctx.company.id, from, to),
    fetchSalesLines(ctx.db, ctx.company.id, monthStart, monthEnd),
    fetchDayTotals(ctx.db, ctx.company.id, from, to),
    fetchDayTotals(ctx.db, ctx.company.id, monthStart, monthEnd),
    fetchCashSessions(ctx.db, ctx.company.id, from, to),
    canSeeCosts ? fetchFoodPurchases(ctx.db, ctx.company.id, from, to) : Promise.resolve(null),
    canSeeCosts ? fetchMonthlyTotal(ctx.db, ctx.company.id, monthKey) : Promise.resolve(null),
  ]);

  const confirmed = rangeLines.filter((l) => l.status === "confirmed");
  const confirmedTotals = rangeTotals.filter((d) => d.status === "confirmed");
  const drafts = [...rangeLines.filter((l) => l.status === "draft"), ...rangeTotals.filter((d) => d.status === "draft")];
  // a FeedMe day total is the sales of its day; the split lines of that day only explain it (see combineDays)
  const days = combineDays(confirmed, confirmedTotals);
  const t = totalsOfDays(days);
  const feedme = feedmeExtras(confirmedTotals);
  const feedmeDates = new Set(confirmedTotals.map((d) => d.sales_date));
  const byChannel = groupNet(confirmed, (l) => l.channel);
  const byPayment = groupNet(confirmed, (l) => l.payment_method);
  // what a FeedMe day total holds beyond the split lines keyed in for the same day
  const notSplit = days.filter((d) => d.source === "feedme").reduce((sum, d) => sum + (d.net - d.linesNet), 0);
  const withNotSplit = (rows: ReturnType<typeof groupNet>) => (feedmeDates.size > 0 && Math.abs(notSplit) >= 0.005 ? [...rows, { key: NOT_SPLIT, net: notSplit, orders: 0, lines: 0 }] : rows);
  const channelRows = withNotSplit(byChannel);
  const paymentRows = withNotSplit(byPayment);
  const labelOf = (key: string, fallback: (k: string) => string) => (key === NOT_SPLIT ? "Not split (FeedMe day total)" : fallback(key));
  const differs = days.filter((d) => d.source === "feedme" && d.linesCount > 0 && Math.abs(d.net - d.linesNet) >= 0.005);
  const byDay = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const missing = missingDays(from, to, rangeLines, today, rangeTotals);
  const closedSessions = cash.filter((s) => s.status === "closed");
  const cashVariance = closedSessions.reduce((sum, s) => sum + (s.variance ?? 0), 0);
  const openSessions = cash.filter((s) => s.status === "open");
  const noSales = days.length === 0;

  const monthDaysSales = combineDays(
    monthLines.filter((l) => l.status === "confirmed"),
    monthTotals.filter((d) => d.status === "confirmed"),
  );
  const monthDaily = totalsOfDays(monthDaysSales).net;
  const monthDays = monthDaysSales.length;

  const q = ctx.requestedCompany ? `&company=${ctx.requestedCompany}` : "";
  const salesLink = (extra: string) => `/restaurant/sales?from=${from}&to=${to}${extra}${q}`;
  const aov = t.orders > 0 ? t.ordersNet / t.orders : null;
  const profitLike = foodPurchases === null ? null : t.net - foodPurchases;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Restaurant Dashboard</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {ctx.company.name} · {from === to ? dayText(from) : `${dayText(from)} to ${dayText(to)}`} · only confirmed sales are counted
        </p>
      </div>

      <RestaurantSubNav isAdmin={ctx.can.roles} />

      <div className="flex flex-wrap items-end gap-2">
        {(["today", "yesterday", "week", "month"] as RangeKey[]).map((r) => (
          <Link key={r} href={`/restaurant?range=${r}${q}`} className={`rounded-lg border px-3.5 py-2 text-[13px] font-semibold ${key === r ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}>
            {RANGE_LABEL[r]}
          </Link>
        ))}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="range" value="custom" />
          {ctx.requestedCompany && <input type="hidden" name="company" value={ctx.requestedCompany} />}
          <div>
            <label className={SPEND_LABEL}>From</label>
            <input type="date" name="from" defaultValue={from} className={`${SPEND_INPUT} w-40`} />
          </div>
          <div>
            <label className={SPEND_LABEL}>To</label>
            <input type="date" name="to" defaultValue={to} className={`${SPEND_INPUT} w-40`} />
          </div>
          <button type="submit" className={`h-9 rounded-lg border px-3.5 text-[13px] font-semibold ${key === "custom" ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}>
            Show
          </button>
        </form>
      </div>

      {noSales && (
        <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-[13.5px] text-text-secondary">
          <span>No confirmed sales for this period yet, so every figure below is RM0.</span>{" "}
          {drafts.length > 0 && <span>{drafts.length === 1 ? "1 draft line is waiting to be confirmed." : `${drafts.length} draft lines are waiting to be confirmed.`}</span>}{" "}
          <Link href={`/restaurant/sales${ctx.query}`} className="font-semibold text-primary">Enter the daily sales</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon="sales" label="Net sales" value={formatCurrency(t.net)} hint={`Gross ${formatCurrency(t.gross)}`} />
        <KpiCard icon="invoice" label="Orders" value={t.orders > 0 ? String(t.orders) : "—"} hint={t.orders > 0 ? "From the lines that have an order count" : "Order count not entered"} />
        <KpiCard icon="payments" label="Average order value" value={aov === null ? "—" : formatCurrency(Math.round(aov * 100) / 100)} hint={aov === null ? "Insufficient data (no order counts)" : "Net sales ÷ orders"} />
        <KpiCard icon="approvals" label="Discounts and refunds" value={formatCurrency(t.discount + t.refund)} hint={`Discounts ${formatCurrency(t.discount)} · refunds ${formatCurrency(t.refund)}`} tone={t.refund > 0 ? "warning" : "neutral"} />
        <KpiCard icon="supplier" label="Food purchases" value={foodPurchases === null ? "—" : formatCurrency(foodPurchases)} hint={foodPurchases === null ? "No access to Company Expenses" : "Food categories of Company Expenses, when bought"} />
        <KpiCard icon="costing" label="Food purchases % of net sales" value={foodPurchases === null ? "—" : pct(foodPurchases, t.net)} hint="The Bara limit for raw items is 38%" tone={foodPurchases !== null && t.net > 0 && foodPurchases / t.net > 0.38 ? "danger" : "neutral"} />
        <KpiCard icon="expenses" label="Sales less food purchases" value={profitLike === null ? "—" : formatCurrency(Math.round(profitLike * 100) / 100)} hint="Estimate: before labour, utilities and other costs" />
        <KpiCard icon="calendar" label="Cash difference" value={closedSessions.length === 0 ? "—" : formatCurrency(Math.round(cashVariance * 100) / 100)} hint={closedSessions.length === 0 ? "No closed cash session" : closedSessions.length === 1 ? "1 closed session" : `${closedSessions.length} closed sessions`} tone={Math.abs(cashVariance) >= 0.005 ? "danger" : "success"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="By channel">
          {channelRows.length === 0 ? (
            <EmptyRow text="No sales for this period." />
          ) : (
            <table className="w-full text-[13.5px]">
              <tbody>
                {channelRows.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0">
                    <td className="py-2">{r.key === NOT_SPLIT ? <span className="text-text-secondary">{labelOf(r.key, channelLabel)}</span> : <Link className="text-primary hover:underline" href={salesLink(`&channel=${r.key}`)}>{labelOf(r.key, channelLabel)}</Link>}</td>
                    <td className="py-2 text-right text-text-secondary">{pct(r.net, t.net)}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
        <SectionCard title="By payment method">
          {paymentRows.length === 0 ? (
            <EmptyRow text="No sales for this period." />
          ) : (
            <table className="w-full text-[13.5px]">
              <tbody>
                {paymentRows.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0">
                    <td className="py-2">{r.key === NOT_SPLIT ? <span className="text-text-secondary">{labelOf(r.key, paymentLabel)}</span> : <Link className="text-primary hover:underline" href={salesLink(`&method=${r.key}`)}>{labelOf(r.key, paymentLabel)}</Link>}</td>
                    <td className="py-2 text-right text-text-secondary">{pct(r.net, t.net)}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Day by day">
        {byDay.length === 0 ? (
          <EmptyRow text="No sales for this period." />
        ) : (
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-muted">
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">From</th>
                <th className="py-2 text-right font-semibold">Orders</th>
                <th className="py-2 text-right font-semibold">Net sales</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map((r) => (
                <tr key={r.date} className="border-b border-border last:border-0">
                  <td className="py-2"><Link className="text-primary hover:underline" href={`/restaurant/sales?date=${r.date}${q}`}>{dayText(r.date)}</Link></td>
                  <td className="py-2 text-text-secondary">{r.source === "feedme" ? "FeedMe" : "Sales lines"}</td>
                  <td className="py-2 text-right text-text-secondary">{r.orders > 0 ? r.orders : "—"}</td>
                  <td className="py-2 text-right font-semibold">{formatCurrency(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {feedme.days > 0 && (
        <SectionCard title="FeedMe day totals in this period">
          <div className="flex flex-col gap-2 text-[13.5px]">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
              <div className="flex justify-between"><span>Days from FeedMe</span><span className="font-semibold">{feedme.days}</span></div>
              <div className="flex justify-between"><span>Bills</span><span className="font-semibold">{feedme.bills}</span></div>
              <div className="flex justify-between"><span>Pax</span><span className="font-semibold">{feedme.pax}</span></div>
              <div className="flex justify-between"><span>Service charge (SC)</span><span className="font-semibold">{formatCurrency(Math.round(feedme.serviceCharge * 100) / 100)}</span></div>
              <div className="flex justify-between"><span>SST</span><span className="font-semibold">{formatCurrency(Math.round(feedme.sst * 100) / 100)}</span></div>
              <div className="flex justify-between"><span>Delivery fee</span><span className="font-semibold">{formatCurrency(Math.round(feedme.deliveryFee * 100) / 100)}</span></div>
              <div className="flex justify-between"><span>Rounding</span><span className="font-semibold">{formatCurrency(Math.round(feedme.rounding * 100) / 100)}</span></div>
              <div className="flex justify-between sm:col-span-2"><span>Nett collected with the bills</span><span className="font-bold">{formatCurrency(Math.round(feedme.nett * 100) / 100)}</span></div>
            </div>
            <p className="text-[12px] text-text-muted">Net sales above = gross less discount. Service charge, SST, delivery fee and rounding are collected with the bill but are not counted as sales.</p>
            {differs.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[12.5px] text-warning">
                <div className="font-semibold">Check: the split lines differ from the FeedMe total on these days</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {differs.slice(0, 10).map((d) => (
                    <Link key={d.date} href={`/restaurant/sales?date=${d.date}${q}`} className="rounded-md border border-warning/40 bg-surface px-2 py-0.5 text-primary">{`${dayText(d.date)}: ${formatCurrency(Math.round((d.net - d.linesNet) * 100) / 100)}`}</Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Needs your attention">
          <div className="flex flex-col gap-2 text-[13.5px]">
            <div className="flex items-center justify-between">
              <span>Draft sales not confirmed</span>
              <StatusBadge tone={drafts.length > 0 ? "warning" : "success"}>{drafts.length}</StatusBadge>
            </div>
            <div className="flex items-center justify-between">
              <span>Cash sessions still open</span>
              <StatusBadge tone={openSessions.length > 0 ? "warning" : "success"}>{openSessions.length}</StatusBadge>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Past days with no sales entered</span>
              <StatusBadge tone={missing.length > 0 ? "danger" : "success"}>{missing.length}</StatusBadge>
            </div>
            {missing.length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-[12px]">
                {missing.slice(0, 14).map((d) => (
                  <Link key={d} href={`/restaurant/sales?date=${d}${q}`} className="rounded-md border border-border-strong px-2 py-0.5 text-primary">{dayText(d)}</Link>
                ))}
                {missing.length > 14 && <span className="text-text-muted">{`and ${missing.length - 14} more`}</span>}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Daily entries and the monthly Total Sales">
          {!canSeeCosts ? (
            <EmptyRow text="The monthly total is shown to people with Admin & Finance access." />
          ) : (
            <div className="flex flex-col gap-2 text-[13.5px]">
              <div className="text-[12.5px] text-text-muted">{dayText(monthStart)} to {dayText(monthEnd)}</div>
              <div className="flex items-center justify-between"><span>{`Daily entries (confirmed, ${monthDays} ${monthDays === 1 ? "day" : "days"})`}</span><span className="font-semibold">{formatCurrency(monthDaily)}</span></div>
              <div className="flex items-center justify-between"><span>Total Sales of the month (Reports → Monthly Breakdown)</span><span className="font-semibold">{monthlyTotal === null ? "not keyed in yet" : formatCurrency(monthlyTotal)}</span></div>
              {monthlyTotal !== null && (
                <div className="flex items-center justify-between border-t border-border pt-2"><span>Difference</span><span className="font-semibold">{formatCurrency(Math.round((monthDaily - monthlyTotal) * 100) / 100)}</span></div>
              )}
              <p className="text-[12px] text-text-muted">The two are shown side by side to be checked. They are never added together, and the monthly reports still use the Total Sales of the Monthly Breakdown.</p>
              <p className="text-[12px] text-text-muted">The daily entries are compared as net sales: gross less discount, without service charge, SST, delivery fee and rounding.</p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
