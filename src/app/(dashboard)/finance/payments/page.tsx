import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds, listPaymentsForMonth } from "@/lib/finance/paymentQueries";
import {
  PAYMENT_CATEGORY_LABEL,
  STATUS_FILTER_OPTIONS,
  UTILITY_PROVIDERS,
  URGENCY_LABEL,
  URGENCY_REMINDER,
  URGENCY_TONE,
  accountDisplay,
  formatRM,
  matchesStatusFilter,
  paymentUrgency,
  summarizePayments,
  type PaymentCategory,
  type PaymentSummary,
} from "@/lib/finance/payments";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatMalaysiaDate } from "@/lib/format";
import { malaysiaMonthNow, todayInMalaysia } from "@/lib/driverAttendance/date";
import { buildReportRows } from "@/lib/reports/buildRows";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ReportTable } from "@/components/reports/ReportTable";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { Select } from "@/components/ui/Select";

type SearchParams = { company?: string; year?: string; month?: string; category?: string; payee?: string; provider?: string; status?: string };

const CATEGORY_HREF: Record<PaymentCategory, string> = {
  supplier: "/finance/supplier-payment",
  rental: "/finance/rental-payment",
  utility: "/finance/utilities-payment",
};

function Tile({ label, value, tone = "text-text" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-0.5 text-[15px] font-extrabold ${tone}`}>{formatRM(value)}</div>
    </div>
  );
}

function SummaryTiles({ s }: { s: PaymentSummary }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Tile label="Total" value={s.total} />
      <Tile label="Paid" value={s.paid} tone="text-success" />
      <Tile label="Pending" value={s.pending} tone="text-warning" />
      <Tile label="Overdue" value={s.overdue} tone={s.overdue > 0 ? "text-danger" : "text-text"} />
    </div>
  );
}

/** Monthly Finance Payment dashboard: supplier, rental and utilities side by side, with reminders and filters. */
export default async function PaymentDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const adminIds = await adminCompanyIds(supabase, targetCompanyIds, "finance-admin");

  const now = malaysiaMonthNow();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;
  const today = todayInMalaysia();
  const monthLabel = `${MONTH_LABEL[month - 1]} ${year}`;

  const header = (
    <>
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Payment Dashboard — {monthLabel}</p>
      </div>
      <FinanceAdminSubNav />
    </>
  );

  if (adminIds.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="Payment records and bank details are only available to Finance / Admin users of the company." />
      </div>
    );
  }

  const category = (["supplier", "rental", "utility"].includes(sp.category ?? "") ? sp.category : undefined) as PaymentCategory | undefined;
  const all = await listPaymentsForMonth(supabase, adminIds, year, month, { category, provider: sp.provider || undefined, payee: sp.payee || undefined });
  const filtered = all.filter((p) => matchesStatusFilter(paymentUrgency(p.status, p.due_date, today), sp.status));

  const of = (c: PaymentCategory) => filtered.filter((p) => p.category === c);
  const supplier = summarizePayments(of("supplier"), today);
  const rental = summarizePayments(of("rental"), today);
  const utilities = of("utility");
  const utilitySummary = summarizePayments(utilities, today);
  const byProvider = [...UTILITY_PROVIDERS].map((provider) => ({ provider, summary: summarizePayments(utilities.filter((p) => p.utility_provider === provider), today) }));
  const grand = summarizePayments(filtered, today);

  const reminders = filtered
    .filter((p) => p.status !== "paid")
    .map((p) => ({ p, u: paymentUrgency(p.status, p.due_date, today) }))
    .sort((a, b) => (a.p.due_date ?? "9999").localeCompare(b.p.due_date ?? "9999"));

  type Row = (typeof filtered)[number];
  const { headers, tableRows } = buildReportRows(
    filtered,
    [
      { key: "category", label: "Category", exportValue: (r: Row) => PAYMENT_CATEGORY_LABEL[r.category as PaymentCategory] },
      { key: "payee", label: "Supplier / Payee", exportValue: (r: Row) => r.payee_name, display: (r: Row) => <Link href={`/finance/payments/${r.id}`} className="font-semibold text-text hover:text-primary">{r.payee_name}</Link> },
      { key: "provider", label: "Provider", exportValue: (r: Row) => r.utility_provider ?? "—" },
      { key: "account", label: "Account No.", exportValue: (r: Row) => accountDisplay(r.account_no) },
      { key: "company", label: "Company", exportValue: (r: Row) => r.companies?.name ?? "—" },
      { key: "amount", label: "Amount", exportValue: (r: Row) => Number(r.amount), display: (r: Row) => formatRM(Number(r.amount)) },
      { key: "due", label: "Due Date", exportValue: (r: Row) => (r.due_date ? formatMalaysiaDate(`${r.due_date}T12:00:00+08:00`) : "—") },
      {
        key: "status",
        label: "Status",
        exportValue: (r: Row) => URGENCY_LABEL[paymentUrgency(r.status, r.due_date, today)],
        display: (r: Row) => {
          const u = paymentUrgency(r.status, r.due_date, today);
          return <StatusBadge tone={URGENCY_TONE[u]}>{u === "pending" ? URGENCY_LABEL[u] : URGENCY_REMINDER[u]}</StatusBadge>;
        },
      },
      { key: "paid", label: "Paid Date", exportValue: (r: Row) => (r.paid_date ? formatMalaysiaDate(`${r.paid_date}T12:00:00+08:00`) : "—") },
    ],
    (r: Row) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      {header}

      <form method="get" className="flex flex-wrap items-end gap-3">
        {sp.company && <input type="hidden" name="company" value={sp.company} />}
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Year</label>
          <input type="number" name="year" defaultValue={year} className="mt-1 h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Month</label>
          <Select name="month" defaultValue={month} className="mt-1 h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Payment Category</label>
          <Select name="category" defaultValue={category ?? ""} className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All categories</option>
            <option value="supplier">Supplier Payment</option>
            <option value="rental">Rental Payment</option>
            <option value="utility">Utilities Payment</option>
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Supplier / Payee</label>
          <input name="payee" defaultValue={sp.payee ?? ""} placeholder="Search…" className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Utility Provider</label>
          <Select name="provider" defaultValue={sp.provider ?? ""} className="mt-1 h-9 w-40 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All providers</option>
            {UTILITY_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Payment Status</label>
          <Select name="status" defaultValue={sp.status ?? ""} className="mt-1 h-9 w-40 rounded-lg border border-border-strong px-2 text-[13px]">
            {STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
      </form>

      <div className={`rounded-xl border px-4 py-3 ${grand.overdue > 0 ? "border-danger/40 bg-danger-bg" : grand.pending > 0 ? "border-warning/40 bg-warning-bg" : "border-success/30 bg-success-bg"}`}>
        <div className={`text-[15px] font-extrabold ${grand.overdue > 0 ? "text-danger" : grand.pending > 0 ? "text-warning" : "text-success"}`}>
          {grand.pending > 0 ? `${grand.overdue > 0 ? "🔴" : "🟡"} Total still to be paid for ${monthLabel}: ${formatRM(grand.pending)}` : `🟢 Everything for ${monthLabel} is paid`}
        </div>
        {grand.overdue > 0 && <div className="mt-0.5 text-[13px] text-danger">Overdue: {formatRM(grand.overdue)}</div>}
      </div>

      <SectionCard title={`Supplier Payment — ${formatRM(supplier.total)}`} action={<Link href={CATEGORY_HREF.supplier} className="text-[12.5px] font-semibold text-primary">Open</Link>}>
        <SummaryTiles s={supplier} />
      </SectionCard>

      <SectionCard title={`Rental — ${formatRM(rental.total)}`} action={<Link href={CATEGORY_HREF.rental} className="text-[12.5px] font-semibold text-primary">Open</Link>}>
        <SummaryTiles s={rental} />
      </SectionCard>

      <SectionCard title={`Utilities — ${formatRM(utilitySummary.total)}`} action={<Link href={CATEGORY_HREF.utility} className="text-[12.5px] font-semibold text-primary">Open</Link>}>
        <div className="flex flex-col gap-3">
          <SummaryTiles s={utilitySummary} />
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {byProvider.map(({ provider, summary }) => (
              <Tile key={provider} label={provider === "Landlord" ? "Landlord (Elec. & Water)" : provider} value={summary.total} />
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Payment Reminders (${reminders.length})`}>
        {reminders.length === 0 ? (
          <EmptyRow text="No unpaid payments for this month and filter." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {reminders.map(({ p, u }) => (
              <Link key={p.id} href={`/finance/payments/${p.id}`} className="flex items-center justify-between px-5 py-2.5 text-[13px] hover:bg-bg">
                <div>
                  <div className="font-semibold text-text">{p.payee_name}{p.utility_provider ? <span className="ml-2 font-normal text-text-secondary">{p.utility_provider}</span> : null}</div>
                  <div className="text-xs text-text-muted">{PAYMENT_CATEGORY_LABEL[p.category as PaymentCategory]} · {p.companies?.name} · {p.due_date ? `due ${formatMalaysiaDate(`${p.due_date}T12:00:00+08:00`)}` : "no due date"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-text">{formatRM(Number(p.amount))}</span>
                  <StatusBadge tone={URGENCY_TONE[u]}>{u === "pending" ? URGENCY_LABEL[u] : URGENCY_REMINDER[u]}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={`All payments — ${monthLabel}`}>
        {filtered.length === 0 ? (
          <EmptyRow text="No payments recorded for this month and filter." />
        ) : (
          <div className="-mx-5 -mb-5">
            <ReportTable filenameBase={`finance-payments-${year}-${month}`} headers={headers} rows={tableRows} />
          </div>
        )}
      </SectionCard>
    </div>
  );
}
