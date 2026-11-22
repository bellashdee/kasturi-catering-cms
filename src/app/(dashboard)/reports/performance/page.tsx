import { Suspense, cache } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomerInvoices, listSpending } from "@/lib/finance/queries";
import { daysOverdue, invoiceBalance, invoiceTotal, isOpenInvoice } from "@/lib/finance/outstanding";
import { listSupplierOwed } from "@/lib/finance/paymentQueries";
import { salesByCompanyMonth } from "@/lib/reports/sales";
import { MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { formatCurrency, malaysiaYearMonth, todayInMalaysia } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { PrintButton } from "@/components/reports/PrintButton";
import { RankBars, type RankItem } from "@/components/reports/RankBars";
import { SalesYearComparison, type CompanySales } from "@/components/reports/SalesYearComparison";
import { AGING_LABELS, CHART_COLORS, ColumnChart, DonutChart, RED, StackedBar, TrendLines, agingBucket, type Slice } from "@/components/reports/Charts";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { SoftPage } from "@/components/ui/Soft";
import { isRestaurantScope } from "@/lib/restaurantView";

const sum = (v: number[]) => v.reduce((t, x) => t + x, 0);
const TOP = 10;
/** The sales agent of Signature Solution Catering (the JDT game match invoices). */
const SSC_AGENT = "Mr. Ismaizal";

// Each thing the page reads is read once per request, whichever blocks use it (the blocks below load on their own, so the top of the page shows
// first and the rest follows as it is ready). `ids` is the company ids joined with commas, so the same read is found again.
const getInvoices = cache(async (ids: string) => listCustomerInvoices(await createClient(), ids.split(",")));
const getSupplierOwed = cache(async (ids: string) => listSupplierOwed(await createClient(), ids.split(",")));
const getSpending = cache(async (ids: string, year: number) => listSpending(await createClient(), ids.split(","), `${year}-01-01`, `${year}-12-31`));
const getPayments = cache(async (ids: string, year: number) => {
  const { data } = await (await createClient()).from("customer_payments").select("amount, payment_date").in("company_id", ids.split(",")).gte("payment_date", `${year}-01-01`).lte("payment_date", `${year}-12-31`);
  return data ?? [];
});
const getEvents = cache(async (ids: string, year: number) => {
  const { data } = await (await createClient()).from("catering_events").select("service_type, meal_types, pax_count, total_amount, status, event_date").in("company_id", ids.split(",")).gte("event_date", `${year}-01-01`).lte("event_date", `${year}-12-31`);
  return data ?? [];
});
const getMonthlyPurchases = cache(async (ids: string, year: number) => {
  const { data } = await (await createClient()).from("monthly_purchases").select("month, purchase_amount").in("company_id", ids.split(",")).eq("year", year);
  return data ?? [];
});

/**
 * Sales of each company, month by month: the monthly sales keyed in for the company (the figure Monthly Costing and the Admin dashboard use);
 * a month with none keyed counts the invoices issued in it, tax included. The Sales card and the comparison with last year both use it.
 */
const getSalesByCompany = cache(async (ids: string, year: number) => {
  const { by, keyed } = await salesByCompanyMonth(await createClient(), ids.split(","), year);
  return { by, keyedAny: keyed.size > 0 };
});
const totalByMonth = (by: Map<string, number[]>) => Array.from({ length: 12 }, (_, m) => sum(Array.from(by.values(), (v) => v[m])));

/** Sales = the invoices issued in the year (drafts and quotation requests waiting for review are not issued), tax included. */
async function getYearInvoices(ids: string, year: number) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return (await getInvoices(ids)).filter((i) => (isOpenInvoice(i.status) || i.status === "paid") && i.invoice_date >= start && i.invoice_date <= end);
}

function Stat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
      <div className={`mt-1 text-[22px] font-extrabold leading-tight ${bad ? "text-danger" : "text-text"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-text-secondary">{sub}</div>}
    </div>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="mb-3 text-[12px] text-text-secondary">{children}</p>;
const More = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link href={to} className="mt-3 inline-block text-[12.5px] font-semibold text-primary underline print:hidden">{children} →</Link>
);
const Skeleton = ({ height = 260 }: { height?: number }) => <div className="animate-pulse rounded-2xl border border-border bg-surface-alt" style={{ height }} aria-busy="true" />;

type BlockProps = { ids: string; year: number; /** 0 = the whole year */ month: number; query: string; requestedId?: string; /** O2 Life (the restaurant) is the only company viewed: no event blocks */ restaurant?: boolean };
const periodOf = (year: number, month: number) => (month ? `${MONTH_LABEL[month - 1]} ${year}` : String(year));
const inMonth = (date: string, month: number) => !month || Number(date.slice(5, 7)) === month;

/** The cards and the two charts of the money: what came in, what went out, sales against purchases. */
async function Headline({ ids, year, month, query }: BlockProps) {
  const now = malaysiaYearMonth();
  // the months that have come: a month still to come is left out of the lines instead of dropping to 0
  const lastMonth = year < now.year ? 12 : year > now.year ? 0 : now.month;
  const [yearInvoices, payments, spending, sales] = await Promise.all([getYearInvoices(ids, year), getPayments(ids, year), getSpending(ids, year), getSalesByCompany(ids, year)]);

  // sales of a month = the monthly sales keyed in, or the invoices issued in a month with none keyed (see getSalesByCompany)
  const salesByMonth = totalByMonth(sales.by);
  // the cards are for the month chosen (the whole year when none); the charts keep the whole year so the month can be seen in its year
  const pick = (v: number[]) => (month ? v[month - 1] : sum(v));
  const invoiced = pick(salesByMonth);
  const invoiceCount = yearInvoices.filter((i) => inMonth(i.invoice_date, month)).length;

  const receivedByMonth = Array<number>(12).fill(0);
  for (const p of payments) receivedByMonth[Number(p.payment_date.slice(5, 7)) - 1] += Number(p.amount);
  const received = pick(receivedByMonth);

  const expenseByMonth = Array<number>(12).fill(0);
  const cats = new Set<string>();
  for (const c of spending) {
    const m = Number(c.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) expenseByMonth[m] += c.amount;
    if (inMonth(c.date, month)) cats.add(c.category.toUpperCase().replace(/\s+/g, " ").trim());
  }
  const totalExpenses = pick(expenseByMonth);

  const net = received - totalExpenses;
  const upTo = (v: number[]): (number | null)[] => v.map((x, i) => (i < lastMonth ? x : null));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sales" value={formatCurrency(invoiced)} sub={sales.keyedAny ? `${invoiceCount} invoices + recorded monthly sales` : `${invoiceCount} invoices issued`} />
        <Stat label="Money received" value={formatCurrency(received)} sub={month ? "payments in the month" : "payments in the year"} />
        <Stat label="Total expenses" value={formatCurrency(totalExpenses)} sub={`${cats.size} categories`} />
        <Stat label="Received less expenses" value={formatCurrency(net)} bad={net < 0} sub={received > 0 ? `${((net / received) * 100).toFixed(1)}% of money received` : undefined} />
      </div>

      <SectionCard title={`Money Received and Expenses — ${year}`}>
        <Note>Month by month: payments received against every cost recorded.</Note>
        <TrendLines series={[{ label: "Money received", values: upTo(receivedByMonth), color: "#2e9e6b" }, { label: "Expenses", values: upTo(expenseByMonth), color: RED }]} />
        <More to={`/reports/revenue${query}`}>Revenue Report</More>
      </SectionCard>
    </>
  );
}

/**
 * Sales of the chosen year against the year before, for the companies in scope (this was the "Sales: this year vs last year" report). Sales by
 * month are shown here only, with the purchases of the year beside them.
 */
async function SalesVsLastYear({ ids, year }: BlockProps) {
  const now = malaysiaYearMonth();
  const lastMonth = year < now.year ? 12 : year > now.year ? 0 : now.month;
  const [cur, prev, monthlyPurchases, companiesRes] = await Promise.all([
    getSalesByCompany(ids, year),
    getSalesByCompany(ids, year - 1),
    getMonthlyPurchases(ids, year),
    (await createClient()).from("companies").select("id, name").in("id", ids.split(",")).order("name"),
  ]);
  const purchases = Array<number>(12).fill(0);
  for (const p of monthlyPurchases) purchases[p.month - 1] += Number(p.purchase_amount);
  const zero = Array<number>(12).fill(0);
  const companies: CompanySales[] = (companiesRes.data ?? []).map((c) => ({ id: c.id, name: c.name, current: cur.by.get(c.id) ?? zero, previous: prev.by.get(c.id) ?? zero }));
  return (
    <SalesYearComparison
      year={year}
      compare={year - 1}
      lastMonth={lastMonth}
      current={totalByMonth(cur.by)}
      previous={totalByMonth(prev.by)}
      purchases={purchases}
      companies={companies}
    />
  );
}

/** The two rings: revenue by type of serving and the breakdown of expenses. */
async function Rings({ ids, year, month, query, restaurant }: BlockProps) {
  const [events, spending, sales] = await Promise.all([getEvents(ids, year), getSpending(ids, year), getSalesByCompany(ids, year)]);

  // The ring adds up to the Sales of the period (the same figure as the Sales card): each month's sales are split by the type of serving of
  // that month's events. Sales with no event behind them (months before events were kept here) show as "No event record"; when a month's
  // events come to more than its sales (not yet invoiced or keyed in), its event types are counted in proportion to the sales.
  const salesByMonth = totalByMonth(sales.by);
  const perMonth = Array.from({ length: 12 }, () => new Map<string, { value: number; count: number }>());
  for (const e of events) {
    if (e.status === "cancelled") continue;
    const label = e.service_type ? SERVICE_TYPE_LABEL[e.service_type] ?? e.service_type : "Not stated";
    const c = perMonth[Number(e.event_date.slice(5, 7)) - 1].get(label) ?? { value: 0, count: 0 };
    c.value += Number(e.total_amount ?? 0);
    c.count += 1;
    perMonth[Number(e.event_date.slice(5, 7)) - 1].set(label, c);
  }
  const productBy = new Map<string, { value: number; count: number }>();
  let noEvent = 0;
  let overSales = 0;
  for (let m = 1; m <= 12; m++) {
    if (!inMonth(`${year}-${String(m).padStart(2, "0")}-01`, month)) continue;
    const eventTotal = sum(Array.from(perMonth[m - 1].values(), (c) => c.value));
    const monthSales = salesByMonth[m - 1];
    const factor = eventTotal > monthSales ? (eventTotal > 0 ? monthSales / eventTotal : 0) : 1;
    if (eventTotal > monthSales) overSales += eventTotal - monthSales;
    else noEvent += monthSales - eventTotal;
    for (const [label, c] of perMonth[m - 1]) {
      const t = productBy.get(label) ?? { value: 0, count: 0 };
      t.value += c.value * factor;
      t.count += c.count;
      productBy.set(label, t);
    }
  }
  const products: Slice[] = Array.from(productBy.entries())
    .filter(([, c]) => c.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} event${c.count === 1 ? "" : "s"}` }));
  if (noEvent > 0.005) products.push({ label: "No event record", value: noEvent, note: "sales with no event in the system", color: CHART_COLORS[6] });

  // expenses by category (the same names in other capitals count as one): the biggest six, the rest grouped as Other
  const catBy = new Map<string, number>();
  for (const c of spending) {
    if (!inMonth(c.date, month)) continue;
    const key = c.category.toUpperCase().replace(/\s+/g, " ").trim();
    catBy.set(key, (catBy.get(key) ?? 0) + c.amount);
  }
  const cats = Array.from(catBy.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const expenses: Slice[] = cats.slice(0, 6).map(([label, value]) => ({ label, value }));
  if (cats.length > 6) expenses.push({ label: `Other (${cats.length - 6} categories)`, value: sum(cats.slice(6).map(([, v]) => v)), color: CHART_COLORS[6] });

  return (
    <div className={`grid gap-4 ${restaurant ? "" : "lg:grid-cols-2"}`}>
      {!restaurant && (
      <SectionCard title={`Revenue by Type of Serving — ${periodOf(year, month)}`}>
        <Note>
          The {month ? "month" : "year"}&apos;s sales ({formatCurrency(sum(products.map((p) => p.value)))}, the same as the Sales card) by type of serving.
          Cancelled events are left out.
          {overSales > 0.005 && ` Events of ${formatCurrency(overSales)} are not in sales yet (not invoiced or keyed in), so those months count their events in proportion to their sales.`}
        </Note>
        <DonutChart slices={products} centerLabel="Sales" empty="No sales this year." />
        <More to={`/reports/catering${query}`}>Catering Report</More>
      </SectionCard>
      )}
      <SectionCard title={`Breakdown of Expenses — ${periodOf(year, month)}`}>
        <Note>Every cost recorded in the {month ? "month" : "year"}: the six biggest categories, the rest grouped as Other.</Note>
        <DonutChart slices={expenses} centerLabel="Total expenses" empty="No expenses recorded this year." />
        <More to={`/reports/monthly-costing${query}`}>Monthly Costing Report</More>
      </SectionCard>
    </div>
  );
}

/** Average prices of a group of events: per event (all of them) and per pax (only the events whose pax is filled in, so a blank pax does not skew it). */
type PriceRow = { label: string; events: number; revenue: number; pax: number; paxRevenue: number };

function PriceTable({ first, rows }: { first: string; rows: PriceRow[] }) {
  if (rows.length === 0) return <EmptyRow text="No events to show." />;
  const num = "whitespace-nowrap py-2 pl-3 text-right tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wider text-text-secondary">
            <th className="py-2 pr-3 font-bold">{first}</th>
            <th className="py-2 pl-3 text-right font-bold">Events</th>
            <th className="py-2 pl-3 text-right font-bold">Pax</th>
            <th className="py-2 pl-3 text-right font-bold">Average / pax</th>
            <th className="py-2 pl-3 text-right font-bold">Average / event</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-b-0">
              <td className="py-2 pr-3 font-semibold text-text">{r.label}</td>
              <td className={`${num} text-text-secondary`}>{r.events}</td>
              <td className={`${num} text-text-secondary`}>{r.pax > 0 ? r.pax.toLocaleString("en-MY") : "—"}</td>
              <td className={`${num} font-bold text-text`}>{r.pax > 0 ? formatCurrency(r.paxRevenue / r.pax) : "—"}</td>
              <td className={`${num} text-text`}>{formatCurrency(r.revenue / r.events)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Average price for each type of serving and each meal type, from the events themselves (their amount and pax; cancelled and RM 0 events
 * left out). This is not the ring above, which is scaled to the Sales card. An event with several meal types counts in each of them.
 */
async function AveragePrices({ ids, year, month, query }: BlockProps) {
  const events = (await getEvents(ids, year)).filter((e) => e.status !== "cancelled" && inMonth(e.event_date, month) && Number(e.total_amount ?? 0) > 0);
  const byServing = new Map<string, PriceRow>();
  const byMeal = new Map<string, PriceRow>();
  const total: PriceRow = { label: "All events", events: 0, revenue: 0, pax: 0, paxRevenue: 0 };
  const add = (r: PriceRow, amount: number, pax: number) => {
    r.events += 1;
    r.revenue += amount;
    if (pax > 0) {
      r.pax += pax;
      r.paxRevenue += amount;
    }
  };
  const rowOf = (map: Map<string, PriceRow>, label: string) => {
    const r = map.get(label) ?? { label, events: 0, revenue: 0, pax: 0, paxRevenue: 0 };
    map.set(label, r);
    return r;
  };
  let withMeal = 0;
  for (const e of events) {
    const amount = Number(e.total_amount ?? 0);
    const pax = Number(e.pax_count ?? 0);
    add(total, amount, pax);
    add(rowOf(byServing, e.service_type ? SERVICE_TYPE_LABEL[e.service_type] ?? e.service_type : "Not stated"), amount, pax);
    const meals = Array.from(new Set((e.meal_types ?? []).filter(Boolean)));
    if (meals.length > 0) withMeal += 1;
    for (const m of meals) add(rowOf(byMeal, MEAL_TYPE_LABEL[m] ?? m), amount, pax);
  }
  const sorted = (map: Map<string, PriceRow>) => Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);

  return (
    <SectionCard title={`Average Price — ${periodOf(year, month)}`}>
      <Note>
        {month
          ? "From the events of the month, cancelled and RM 0 events left out. Average per pax = the event amounts over their pax (events with pax filled in); average per event = the amounts over the number of events."
          : "From the events of the year, cancelled and RM 0 events left out. Average per pax = the event amounts over their pax (events with pax filled in); average per event = the amounts over the number of events."}{" "}
        {total.pax > 0 && <b className="text-text">{`All events: ${formatCurrency(total.paxRevenue / total.pax)} per pax, ${formatCurrency(total.revenue / total.events)} per event.`}</b>}
      </Note>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wider text-text-secondary">By type of serving</div>
          <PriceTable first="Type of serving" rows={sorted(byServing)} />
        </div>
        <div>
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wider text-text-secondary">By meal type</div>
          <PriceTable first="Meal type" rows={sorted(byMeal)} />
          <p className="mt-2 text-[12px] text-text-secondary">{`${withMeal} of ${events.length} events have a meal type ticked. Tick the meal type on the event to count it here.`}</p>
        </div>
      </div>
      <More to={`/reports/catering${query}`}>Catering Report</More>
    </SectionCard>
  );
}

/** The key customers by sales volume and the top sales agents. */
async function People({ ids, year, month, query, requestedId }: BlockProps) {
  const yearInvoices = (await getYearInvoices(ids, year)).filter((i) => inMonth(i.invoice_date, month));
  const invoiced = sum(yearInvoices.map((i) => invoiceTotal(i)));

  const salesBy = new Map<string, { value: number; count: number }>();
  for (const i of yearInvoices) {
    const name = i.customers?.name ?? "—";
    const c = salesBy.get(name) ?? { value: 0, count: 0 };
    c.value += invoiceTotal(i);
    c.count += 1;
    salesBy.set(name, c);
  }
  const keyCustomers: RankItem[] = Array.from(salesBy.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, TOP)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} invoice${c.count === 1 ? "" : "s"}` }));

  // top sales agents: the invoices of the year credited to the sales agent on the customer's details (Signature Solution Catering: Mr. Ismaizal)
  const agentBy = new Map<string, { value: number; count: number; customers: Set<string> }>();
  const noAgent = { value: 0, count: 0 };
  for (const i of yearInvoices) {
    const agent = i.customers?.sales_agent?.trim() || ((i.description ?? "").includes("Signature Solution Catering") ? SSC_AGENT : "");
    if (!agent) {
      noAgent.value += invoiceTotal(i);
      noAgent.count += 1;
      continue;
    }
    const c = agentBy.get(agent) ?? { value: 0, count: 0, customers: new Set<string>() };
    c.value += invoiceTotal(i);
    c.count += 1;
    c.customers.add(i.customers?.name ?? i.customer_id);
    agentBy.set(agent, c);
  }
  const agents = Array.from(agentBy.entries())
    .filter(([, c]) => c.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} inv · ${c.customers.size} cust` }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title={`Key Customers by Sales Volume — ${periodOf(year, month)}`}>
        <Note>Invoices issued in the {month ? "month" : "year"}, tax included. Top {TOP}.</Note>
        <RankBars items={keyCustomers} total={invoiced} empty="No invoices issued this year." />
        <More to={`/reports/revenue?view=invoiced${requestedId ? `&company=${requestedId}` : ""}`}>Revenue Report · Invoices issued</More>
      </SectionCard>
      <SectionCard title={`Top Sales Agents — ${periodOf(year, month)}`}>
        <Note>Invoices of the {month ? "month" : "year"} credited to the sales agent on the customer&apos;s details (Signature Solution Catering: {SSC_AGENT}). Biggest first.</Note>
        <ColumnChart items={agents} empty="No customer with a sales agent was invoiced this year." />
        {noAgent.count > 0 && (
          <p className="mt-3 text-[12px] text-text-secondary">
            No sales agent on the customer: {formatCurrency(noAgent.value)} from {noAgent.count} invoice{noAgent.count === 1 ? "" : "s"}, not in the chart. Fill in the sales agent on the customer to count it.
          </p>
        )}
        <More to={`/catering/customers${query}`}>Customers</More>
      </SectionCard>
    </div>
  );
}

/** Who still owes us: how late the unpaid invoices are and the customers with the biggest balance. */
async function OwedToUs({ ids, query }: BlockProps) {
  const today = todayInMalaysia();
  const invoices = await getInvoices(ids);
  // the balance of every issued invoice that is not settled, all years, as it stands today
  const open = invoices.filter((i) => isOpenInvoice(i.status)).map((i) => ({ i, balance: invoiceBalance(i) })).filter((x) => x.balance > 0);
  const owedAll = sum(open.map((x) => x.balance));
  const owedBy = new Map<string, { value: number; count: number; late: number }>();
  const aging = [0, 0, 0, 0, 0];
  for (const { i, balance } of open) {
    const days = daysOverdue(i.due_date, today);
    aging[agingBucket(days)] += balance;
    const name = i.customers?.name ?? "—";
    const c = owedBy.get(name) ?? { value: 0, count: 0, late: 0 };
    c.value += balance;
    c.count += 1;
    c.late = Math.max(c.late, days);
    owedBy.set(name, c);
  }
  const outstanding: RankItem[] = Array.from(owedBy.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, TOP)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} invoice${c.count === 1 ? "" : "s"}`, flag: c.late > 0 ? `${c.late} days late` : undefined }));
  const segments: Slice[] = AGING_LABELS.map((a, k) => ({ ...a, value: aging[k] }));

  return (
    <SectionCard title="Who Still Owes Us">
      <Note>The balance still unpaid on every issued invoice after the payments received, all years, as it stands today: {formatCurrency(owedAll)} in all, from {owedBy.size} customer{owedBy.size === 1 ? "" : "s"}.</Note>
      {open.length === 0 ? (
        <EmptyRow text="Nothing is owed. Every invoice is paid." />
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-text-secondary">How late is it</div>
            <StackedBar segments={segments} />
          </div>
          <div>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-text-secondary">Customers, biggest balance first (top {TOP})</div>
            <RankBars items={outstanding} total={owedAll} color={RED} empty="Nothing is owed." />
          </div>
        </div>
      )}
      <More to={`/reports/customer-outstanding${query}`}>Customer Outstanding Report</More>
    </SectionCard>
  );
}

/** Who we still owe: how late the supplier invoices are and the suppliers with the biggest balance. */
async function OwedByUs({ ids, query }: BlockProps) {
  const today = todayInMalaysia();
  const open = (await getSupplierOwed(ids)).map((i) => ({ i, balance: i.balance }));
  const owedAll = sum(open.map((x) => x.balance));
  const owedBy = new Map<string, { value: number; count: number; late: number }>();
  const aging = [0, 0, 0, 0, 0];
  for (const { i, balance } of open) {
    const days = i.due_date ? daysOverdue(i.due_date, today) : 0;
    aging[agingBucket(days)] += balance;
    const name = i.payee_name.trim().toUpperCase().replace(/\s+/g, " ");
    const c = owedBy.get(name) ?? { value: 0, count: 0, late: 0 };
    c.value += balance;
    c.count += 1;
    c.late = Math.max(c.late, days);
    owedBy.set(name, c);
  }
  const weOwe: RankItem[] = Array.from(owedBy.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, TOP)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} invoice${c.count === 1 ? "" : "s"}`, flag: c.late > 0 ? `${c.late} days late` : undefined }));
  const segments: Slice[] = AGING_LABELS.map((a, k) => ({ ...a, value: aging[k] }));

  return (
    <SectionCard title="Who We Still Owe">
      <Note>What is still to be paid to the suppliers, from the monthly supplier payments of Finance (the supplier statements): {formatCurrency(owedAll)} in all, to {owedBy.size} supplier{owedBy.size === 1 ? "" : "s"}.</Note>
      {open.length === 0 ? (
        <EmptyRow text="No supplier payment is waiting to be paid." />
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-text-secondary">How late is it</div>
            <StackedBar segments={segments} />
          </div>
          <div>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-text-secondary">Suppliers, biggest balance first (top {TOP})</div>
            <RankBars items={weOwe} total={owedAll} color="#b8794a" empty="Nothing is owed." />
          </div>
        </div>
      )}
      <More to={`/reports/supplier-outstanding${query}`}>Supplier Outstanding Report</More>
    </SectionCard>
  );
}

/**
 * Performance Dashboard: the chosen year of the chosen company on one page. Every figure is worked out the same way as on the report it links to,
 * so they tally. The page shows its heading and filters at once and each block follows as soon as its own figures are ready.
 */
export default async function PerformanceDashboardPage({ searchParams }: { searchParams: Promise<{ company?: string; year?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam, month: monthParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const year = Number(yearParam) || malaysiaYearMonth().year;
  const month = Math.min(Math.max(Number(monthParam) || 0, 0), 12);
  const selected = companies.find((c) => targetCompanyIds.length === 1 && c.id === targetCompanyIds[0]);
  const restaurant = isRestaurantScope(companies, targetCompanyIds);
  const props: BlockProps = { ids: [...targetCompanyIds].sort().join(","), year, month, query, requestedId, restaurant };

  return (
    <SoftPage>
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Performance Dashboard — {selected ? selected.name : "All Companies"}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{periodOf(year, month)} · sales (compared with the year before), expenses and what is still owed, from the recorded figures. What is owed is as it stands today. Each block links to the report with its detail.</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <ReportFilterBar path="/reports/performance" requestedCompanyId={requestedId} year={year} month={month} monthAll showRange={false} />
        <PrintButton />
      </div>

      <Suspense fallback={<Skeleton height={420} />}><Headline {...props} /></Suspense>
      <Suspense fallback={<Skeleton height={520} />}><SalesVsLastYear {...props} /></Suspense>
      <Suspense fallback={<Skeleton />}><Rings {...props} /></Suspense>
      {!restaurant && <Suspense fallback={<Skeleton />}><AveragePrices {...props} /></Suspense>}
      {!restaurant && <Suspense fallback={<Skeleton />}><People {...props} /></Suspense>}
      {!restaurant && <Suspense fallback={<Skeleton height={340} />}><OwedToUs {...props} /></Suspense>}
      <Suspense fallback={<Skeleton height={340} />}><OwedByUs {...props} /></Suspense>
    </SoftPage>
  );
}
