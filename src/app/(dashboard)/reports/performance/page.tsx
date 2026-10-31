import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomerInvoices, listSpending } from "@/lib/finance/queries";
import { isOverdue } from "@/lib/finance/constants";
import { SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { PrintButton } from "@/components/reports/PrintButton";
import { RankBars, type RankItem } from "@/components/reports/RankBars";
import { SalesPurchasesChart } from "@/components/reports/SalesPurchasesChart";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { SoftPage } from "@/components/ui/Soft";

const sum = (v: number[]) => v.reduce((t, x) => t + x, 0);
const TOP = 10;
/** The sales agent of Signature Solution Catering (the JDT game match invoices). */
const SSC_AGENT = "Mr. Ismaizal";

function Stat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
      <div className={`mt-1 text-[22px] font-extrabold leading-tight ${bad ? "text-danger" : "text-text"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-text-secondary">{sub}</div>}
    </div>
  );
}

const More = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link href={to} className="mt-3 inline-block text-[12.5px] font-semibold text-primary underline print:hidden">{children} →</Link>
);

/**
 * Performance Dashboard: the chosen year of the chosen company on one page — sales, expenses and what is still owed, then the top-selling
 * products (types of serving), the key customers by sales volume, the ranking of customers with an outstanding balance and the breakdown
 * of expenses. Each block links to the report that holds its detail.
 */
export default async function PerformanceDashboardPage({ searchParams }: { searchParams: Promise<{ company?: string; year?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const year = Number(yearParam) || malaysiaYearMonth().year;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const selected = companies.find((c) => targetCompanyIds.length === 1 && c.id === targetCompanyIds[0]);

  const [invoices, payments, events, spending, monthlySales, monthlyPurchases] = await Promise.all([
    listCustomerInvoices(supabase, targetCompanyIds),
    supabase.from("customer_payments").select("amount").in("company_id", targetCompanyIds).gte("payment_date", start).lte("payment_date", end),
    supabase.from("catering_events").select("service_type, total_amount, status, sales_agent").in("company_id", targetCompanyIds).gte("event_date", start).lte("event_date", end),
    listSpending(supabase, targetCompanyIds, start, end),
    supabase.from("monthly_sales").select("month, sales_amount").in("company_id", targetCompanyIds).eq("year", year),
    supabase.from("monthly_purchases").select("month, purchase_amount").in("company_id", targetCompanyIds).eq("year", year),
  ]);
  const salesByMonth = Array<number>(12).fill(0);
  const purchasesByMonth = Array<number>(12).fill(0);
  for (const s of monthlySales.data ?? []) salesByMonth[s.month - 1] += Number(s.sales_amount);
  for (const p of monthlyPurchases.data ?? []) purchasesByMonth[p.month - 1] += Number(p.purchase_amount);

  // sales volume = the invoices issued in the year (drafts left out), tax included; received = payments with a payment date in the year
  const yearInvoices = invoices.filter((i) => i.status !== "draft" && i.invoice_date >= start && i.invoice_date <= end);
  const invoiced = sum(yearInvoices.map((i) => Number(i.amount) + Number(i.tax_amount ?? 0)));
  const received = sum((payments.data ?? []).map((p) => Number(p.amount)));
  const totalExpenses = sum(spending.map((c) => c.amount));

  // key customers by sales volume
  const salesBy = new Map<string, { value: number; count: number }>();
  for (const i of yearInvoices) {
    const name = i.customers?.name ?? "—";
    const c = salesBy.get(name) ?? { value: 0, count: 0 };
    c.value += Number(i.amount) + Number(i.tax_amount ?? 0);
    c.count += 1;
    salesBy.set(name, c);
  }
  const keyCustomers: RankItem[] = Array.from(salesBy.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, TOP)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} invoice${c.count === 1 ? "" : "s"}` }));

  // customers with an outstanding balance: invoice total less what was paid on it, all years, as it stands today
  const owedBy = new Map<string, { value: number; count: number; overdue: boolean }>();
  for (const i of invoices) {
    if (i.status === "paid" || i.status === "draft") continue;
    const balance = Number(i.amount) + Number(i.tax_amount ?? 0) - sum((i.customer_payments ?? []).map((p) => Number(p.amount)));
    if (balance <= 0.005) continue;
    const name = i.customers?.name ?? "—";
    const c = owedBy.get(name) ?? { value: 0, count: 0, overdue: false };
    c.value += balance;
    c.count += 1;
    c.overdue = c.overdue || isOverdue(i.due_date, i.status);
    owedBy.set(name, c);
  }
  const owedAll = Array.from(owedBy.values()).reduce((t, c) => t + c.value, 0);
  const outstanding: RankItem[] = Array.from(owedBy.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, TOP)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} invoice${c.count === 1 ? "" : "s"}`, flag: c.overdue ? "overdue" : undefined }));

  // top-selling products: the type of serving of the year's events (cancelled left out)
  const productBy = new Map<string, { value: number; count: number }>();
  for (const e of events.data ?? []) {
    if (e.status === "cancelled") continue;
    const label = e.service_type ? SERVICE_TYPE_LABEL[e.service_type] ?? e.service_type : "Not stated";
    const c = productBy.get(label) ?? { value: 0, count: 0 };
    c.value += Number(e.total_amount ?? 0);
    c.count += 1;
    productBy.set(label, c);
  }
  const products: RankItem[] = Array.from(productBy.entries())
    .filter(([, c]) => c.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} event${c.count === 1 ? "" : "s"}` }));

  // top sales agents: the invoices issued in the year, credited to the sales agent kept on the customer's details; the Signature Solution
  // Catering invoices (JDT game matches) are Mr. Ismaizal's; a customer with no agent goes to its own line
  const agentBy = new Map<string, { value: number; count: number; customers: Set<string> }>();
  const noAgent = { value: 0, count: 0 };
  for (const i of yearInvoices) {
    const total = Number(i.amount) + Number(i.tax_amount ?? 0);
    const agent = i.customers?.sales_agent?.trim() || ((i.description ?? "").includes("Signature Solution Catering") ? SSC_AGENT : "");
    if (!agent) {
      noAgent.value += total;
      noAgent.count += 1;
      continue;
    }
    const c = agentBy.get(agent) ?? { value: 0, count: 0, customers: new Set<string>() };
    c.value += total;
    c.count += 1;
    c.customers.add(i.customers?.name ?? i.customer_id);
    agentBy.set(agent, c);
  }
  const agents: RankItem[] = Array.from(agentBy.entries())
    .filter(([, c]) => c.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, c]) => ({ label, value: c.value, note: `${c.count} invoice${c.count === 1 ? "" : "s"} · ${c.customers.size} customer${c.customers.size === 1 ? "" : "s"}` }));
  const agentsTotal = sum(agents.map((a) => a.value)) + noAgent.value;

  // breakdown of expenses by category (the same names written in other capitals count as one), the smallest grouped as Other
  const catBy = new Map<string, { label: string; value: number }>();
  for (const c of spending) {
    const key = c.category.toUpperCase().replace(/\s+/g, " ").trim();
    const row = catBy.get(key) ?? { label: key, value: 0 };
    row.value += c.amount;
    catBy.set(key, row);
  }
  const cats = Array.from(catBy.values()).filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
  const expenses: RankItem[] = cats.slice(0, TOP).map((c) => ({ label: c.label, value: c.value }));
  if (cats.length > TOP) expenses.push({ label: `Other (${cats.length - TOP} categories)`, value: sum(cats.slice(TOP).map((c) => c.value)) });

  const net = received - totalExpenses;

  return (
    <SoftPage>
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Performance Dashboard — {selected ? selected.name : "All Companies"}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{year} · sales, expenses and what is still owed, from the recorded figures.</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <ReportFilterBar requestedCompanyId={requestedId} year={year} showMonth={false} />
        <PrintButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Sales invoiced" value={formatCurrency(invoiced)} sub={`${yearInvoices.length} invoices`} />
        <Stat label="Money received" value={formatCurrency(received)} sub="payments in the year" />
        <Stat label="Total expenses" value={formatCurrency(totalExpenses)} sub={`${cats.length} categories`} />
        <Stat label="Received less expenses" value={formatCurrency(net)} bad={net < 0} sub={received > 0 ? `${((net / received) * 100).toFixed(1)}% of money received` : undefined} />
        <Stat label="Still owed to us" value={formatCurrency(owedAll)} bad={owedAll > 0} sub={`${owedBy.size} customer${owedBy.size === 1 ? "" : "s"}, all years, today`} />
      </div>

      <SalesPurchasesChart year={year} sales={salesByMonth} purchases={purchasesByMonth} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Top-Selling Products — ${year}`}>
          <p className="mb-3 text-[12px] text-text-secondary">By type of serving: revenue of the year&apos;s events (cancelled left out).</p>
          <RankBars items={products} empty="No events with revenue this year." />
          <More to={`/reports/catering${query}`}>Catering Report</More>
        </SectionCard>

        <SectionCard title={`Key Customers by Sales Volume — ${year}`}>
          <p className="mb-3 text-[12px] text-text-secondary">Invoices issued in the year, tax included (drafts left out). Top {TOP}.</p>
          <RankBars items={keyCustomers} total={invoiced} empty="No invoices issued this year." />
          <More to={`/reports/revenue?view=invoiced${requestedId ? `&company=${requestedId}` : ""}`}>Revenue Report · Invoices issued</More>
        </SectionCard>

        <SectionCard title={`Top Sales Agents — ${year}`}>
          <p className="mb-3 text-[12px] text-text-secondary">Who brought in the most sales: the invoices issued in the year, credited to the sales agent on the customer&apos;s details (the Signature Solution Catering invoices to {SSC_AGENT}). Biggest first.</p>
          <RankBars items={agents} total={agentsTotal} color="#2f7fc1" empty="No customer with a sales agent was invoiced this year." />
          {noAgent.count > 0 && (
            <p className="mt-3 text-[12px] text-text-secondary">
              Customers with no sales agent on their details: {formatCurrency(noAgent.value)} from {noAgent.count} invoice{noAgent.count === 1 ? "" : "s"} (in the share above, not in the ranking). Fill in the sales agent on the customer to count it here.
            </p>
          )}
          <More to={`/catering/customers${query}`}>Customers</More>
        </SectionCard>

        <SectionCard title="Customers with an Outstanding Balance">
          <p className="mb-3 text-[12px] text-text-secondary">What is still unpaid after the payments received, biggest first. Top {TOP}; all years, as it stands today.</p>
          <RankBars items={outstanding} total={owedAll} color="var(--color-danger, #b42318)" empty="Nothing is owed. Every invoice is paid." />
          <More to={`/reports/customer-outstanding${query}`}>Customer Outstanding Report</More>
        </SectionCard>

        <SectionCard title={`Breakdown of Expenses — ${year}`}>
          <p className="mb-3 text-[12px] text-text-secondary">Every cost recorded in the year, by category. Top {TOP}, the rest grouped as Other.</p>
          <RankBars items={expenses} total={totalExpenses} color="#e0a030" empty="No expenses recorded this year." />
          <More to={`/reports/monthly-costing${query}`}>Monthly Costing Report</More>
        </SectionCard>
      </div>
    </SoftPage>
  );
}
