import { Suspense, cache } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomerInvoices, listSpending } from "@/lib/finance/queries";
import { daysOverdue, invoiceBalance, invoiceTotal, isOpenInvoice } from "@/lib/finance/outstanding";
import { listSupplierOwed } from "@/lib/finance/paymentQueries";
import { SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { formatCurrency, malaysiaYearMonth, todayInMalaysia } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { PrintButton } from "@/components/reports/PrintButton";
import { RankBars, type RankItem } from "@/components/reports/RankBars";
import { SalesPurchasesChart } from "@/components/reports/SalesPurchasesChart";
import { CHART_COLORS, ColumnChart, DonutChart, RED, StackedBar, TrendLines, type Slice } from "@/components/reports/Charts";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { SoftPage } from "@/components/ui/Soft";

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
  const { data } = await (await createClient()).from("catering_events").select("service_type, total_amount, status, event_date").in("company_id", ids.split(",")).gte("event_date", `${year}-01-01`).lte("event_date", `${year}-12-31`);
  return data ?? [];
});
const getMonthlyPurchases = cache(async (ids: string, year: number) => {
  const { data } = await (await createClient()).from("monthly_purchases").select("month, purchase_amount").in("company_id", ids.split(",")).eq("year", year);
  return data ?? [];
});
const getMonthlySales = cache(async (ids: string, year: number) => {
  const { data } = await (await createClient()).from("monthly_sales").select("company_id, month, sales_amount").in("company_id", ids.split(",")).eq("year", year);
  return data ?? [];
});

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

type BlockProps = { ids: string; year: number; /** 0 = the whole year */ month: number; query: string; requestedId?: string };
const periodOf = (year: number, month: number) => (month ? `${MONTH_LABEL[month - 1]} ${year}` : String(year));
const inMonth = (date: string, month: number) => !month || Number(date.slice(5, 7)) === month;

/** The cards and the two charts of the money: what came in, what went out, sales against purchases. */
async function Headline({ ids, year, month, query }: BlockProps) {
  const now = malaysiaYearMonth();
  // the months that have come: a month still to come is left out of the lines instead of dropping to 0
  const lastMonth = year < now.year ? 12 : year > now.year ? 0 : now.month;
  const [yearInvoices, payments, spending, monthlyPurchases, monthlySales] = await Promise.all([getYearInvoices(ids, year), getPayments(ids, year), getSpending(ids, year), getMonthlyPurchases(ids, year), getMonthlySales(ids, year)]);

  const salesByMonth = Array<number>(12).fill(0);
  for (const i of yearInvoices) salesByMonth[Number(i.invoice_date.slice(5, 7)) - 1] += invoiceTotal(i);
  // a company that keeps no invoices in the system (O2 Life) has its sales as the monthly total recorded for it (the figure Monthly Costing uses)
  const invoicedCompanies = new Set(yearInvoices.map((i) => i.company_id));
  const recordedOnly = new Set<string>();
  for (const s of monthlySales) {
    if (invoicedCompanies.has(s.company_id)) continue;
    salesByMonth[s.month - 1] += Number(s.sales_amount);
    recordedOnly.add(s.company_id);
  }
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

  const purchasesByMonth = Array<number>(12).fill(0);
  for (const p of monthlyPurchases) purchasesByMonth[p.month - 1] += Number(p.purchase_amount);

  const net = received - totalExpenses;
  const upTo = (v: number[]): (number | null)[] => v.map((x, i) => (i < lastMonth ? x : null));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sales" value={formatCurrency(invoiced)} sub={recordedOnly.size > 0 ? `${invoiceCount} invoices + recorded monthly sales` : `${invoiceCount} invoices issued`} />
        <Stat label="Money received" value={formatCurrency(received)} sub={month ? "payments in the month" : "payments in the year"} />
        <Stat label="Total expenses" value={formatCurrency(totalExpenses)} sub={`${cats.size} categories`} />
        <Stat label="Received less expenses" value={formatCurrency(net)} bad={net < 0} sub={received > 0 ? `${((net / received) * 100).toFixed(1)}% of money received` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Money Received and Expenses — ${year}`}>
          <Note>Month by month: payments received against every cost recorded.</Note>
          <TrendLines series={[{ label: "Money received", values: upTo(receivedByMonth), color: "#2e9e6b" }, { label: "Expenses", values: upTo(expenseByMonth), color: RED }]} />
          <More to={`/reports/revenue${query}`}>Revenue Report</More>
        </SectionCard>
        <SalesPurchasesChart year={year} sales={salesByMonth} purchases={purchasesByMonth} />
      </div>
    </>
  );
}

/** The two rings: revenue by type of serving and the breakdown of expenses. */
async function Rings({ ids, year, month, query }: BlockProps) {
  const [events, spending] = await Promise.all([getEvents(ids, year), getSpending(ids, year)]);

  const productBy = new Map<string, { value: number; count: number }>();
  for (const e of events) {
    if (e.status === "cancelled" || !inMonth(e.event_date, month)) continue;
    const label = e.service_type ? SERVICE_TYPE_LABEL[e.service_type] ?? e.service_type : "Not stated";
    const c = productBy.get(label) ?? { value: 0, count: 0 };
    c.value += Number(e.total_amount ?? 0);
    c.count += 1;
    productBy.set(label, c);
  }
  const products: Slice[] = Array.from(productBy.entries())
    .filter(([, c]) => c.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} event${c.count === 1 ? "" : "s"}` }));

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
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title={`Revenue by Type of Serving — ${periodOf(year, month)}`}>
        <Note>Share of the {month ? "month" : "year"}&apos;s event revenue (cancelled events left out).</Note>
        <DonutChart slices={products} centerLabel="Event revenue" empty="No events with revenue this year." />
        <More to={`/reports/catering${query}`}>Catering Report</More>
      </SectionCard>
      <SectionCard title={`Breakdown of Expenses — ${periodOf(year, month)}`}>
        <Note>Every cost recorded in the {month ? "month" : "year"}: the six biggest categories, the rest grouped as Other.</Note>
        <DonutChart slices={expenses} centerLabel="Total expenses" empty="No expenses recorded this year." />
        <More to={`/reports/monthly-costing${query}`}>Monthly Costing Report</More>
      </SectionCard>
    </div>
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

const AGING_LABELS: { label: string; color: string }[] = [
  { label: "Not yet due", color: "#2e9e6b" },
  { label: "1 – 30 days late", color: "#e0a030" },
  { label: "31 – 60 days late", color: "#d9772b" },
  { label: "61 – 90 days late", color: "#c2410c" },
  { label: "Over 90 days late", color: RED },
];
const agingBucket = (days: number) => (days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4);

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
  const props: BlockProps = { ids: [...targetCompanyIds].sort().join(","), year, month, query, requestedId };

  return (
    <SoftPage>
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Performance Dashboard — {selected ? selected.name : "All Companies"}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{periodOf(year, month)} · sales, expenses and what is still owed, from the recorded figures. What is owed is as it stands today. Each block links to the report with its detail.</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <ReportFilterBar requestedCompanyId={requestedId} year={year} month={month} monthAll showRange={false} />
        <PrintButton />
      </div>

      <Suspense fallback={<Skeleton height={420} />}><Headline {...props} /></Suspense>
      <Suspense fallback={<Skeleton />}><Rings {...props} /></Suspense>
      <Suspense fallback={<Skeleton />}><People {...props} /></Suspense>
      <Suspense fallback={<Skeleton height={340} />}><OwedToUs {...props} /></Suspense>
      <Suspense fallback={<Skeleton height={340} />}><OwedByUs {...props} /></Suspense>
    </SoftPage>
  );
}
