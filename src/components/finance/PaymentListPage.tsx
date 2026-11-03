import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { paymentCompanyIds, listPaymentAccounts, listPaymentsForMonth } from "@/lib/finance/paymentQueries";
import {
  PAYMENT_CATEGORY_LABEL,
  STATUS_FILTER_OPTIONS,
  UTILITY_PROVIDERS,
  UTILITY_TYPE_LABEL,
  URGENCY_LABEL,
  URGENCY_REMINDER,
  URGENCY_TONE,
  accountDisplay,
  formatRM,
  matchesStatusFilter,
  paymentUrgency,
  summarizePayments,
  type PaymentCategory,
  type UtilityType,
} from "@/lib/finance/payments";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatMalaysiaDate } from "@/lib/format";
import { malaysiaMonthNow, todayInMalaysia } from "@/lib/driverAttendance/date";
import { buildReportRows } from "@/lib/reports/buildRows";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ReportTable } from "@/components/reports/ReportTable";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { PaymentSummaryCards } from "@/components/finance/PaymentSummaryCards";
import { PaymentRowActions, PaymentUndoBanner } from "@/components/finance/PaymentRowActions";
import { Select } from "@/components/ui/Select";

type SearchParams = { company?: string; year?: string; month?: string; status?: string; payee?: string; provider?: string; saved?: string };

const PATH: Record<PaymentCategory, string> = {
  supplier: "/finance/supplier-payment",
  rental: "/finance/rental-payment",
  utility: "/finance/utilities-payment",
};

function dateOrDash(value: string | null): string {
  return value ? formatMalaysiaDate(`${value}T12:00:00+08:00`) : "—";
}

/** Monthly view of one payment category (supplier, rental or utilities). Rental / utilities also list the reference accounts that have no amount entered yet. */
export async function PaymentListPage({ category, searchParams }: { category: PaymentCategory; searchParams: Promise<SearchParams> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const adminIds = await paymentCompanyIds(supabase, targetCompanyIds, category);
  const query = sp.company ? `company=${sp.company}` : "";

  const now = malaysiaMonthNow();
  const year = Number(sp.year) || now.year;
  // "all" = every month of the year
  const allMonths = sp.month === "all";
  const month = allMonths ? 0 : Number(sp.month) || now.month;
  const today = todayInMalaysia();
  const monthLabel = allMonths ? `All months ${year}` : `${MONTH_LABEL[month - 1]} ${year}`;
  const title = PAYMENT_CATEGORY_LABEL[category];

  const header = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{monthLabel} – {title}{category !== "supplier" ? " – Signature Solution" : ""}</p>
        </div>
        {adminIds.length > 0 && (
          <div className="flex gap-2">
            <Link href={`/finance/payment-accounts?category=${category}${query ? `&${query}` : ""}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
              Manage {category === "supplier" ? "Suppliers" : category === "rental" ? "Rental Payees" : "Utility Accounts"}
            </Link>
            <Link href={`${PATH[category]}/new?year=${year}&month=${month || now.month}${query ? `&${query}` : ""}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
              + New {title}
            </Link>
          </div>
        )}
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

  const [payments, accounts] = await Promise.all([
    listPaymentsForMonth(supabase, adminIds, year, month, { category, provider: sp.provider || undefined, payee: sp.payee || undefined }),
    category === "supplier" ? Promise.resolve([]) : listPaymentAccounts(supabase, adminIds, category),
  ]);

  const rows = payments.filter((p) => matchesStatusFilter(paymentUrgency(p.status, p.due_date, today), sp.status));
  const summary = summarizePayments(payments, today);

  const paidAccountIds = new Set(payments.map((p) => p.account_id).filter((id): id is string => !!id));
  // the reference accounts without an amount only make sense for one month
  const notEntered = category === "supplier" || allMonths ? [] : accounts.filter((a) => !paidAccountIds.has(a.id));

  const columns = [
    {
      key: "payee",
      label: category === "utility" ? "Location" : category === "rental" ? "Rental / Payee" : "Supplier",
      exportValue: (r: (typeof rows)[number]) => r.payee_name,
      display: (r: (typeof rows)[number]) => (
        <div className="flex flex-col gap-1.5">
          <Link href={`/finance/payments/${r.id}`} className="font-semibold text-text hover:text-primary">{r.payee_name}</Link>
          <PaymentRowActions id={r.id} />
        </div>
      ),
    },
    ...(category === "utility"
      ? [
          { key: "provider", label: "Provider", exportValue: (r: (typeof rows)[number]) => r.utility_provider ?? "—" },
          { key: "account", label: "Account No.", exportValue: (r: (typeof rows)[number]) => accountDisplay(r.account_no) },
        ]
      : [
          { key: "bank", label: "Bank", exportValue: (r: (typeof rows)[number]) => r.bank_name ?? "—" },
          { key: "account", label: "Account No.", exportValue: (r: (typeof rows)[number]) => accountDisplay(r.account_no) },
        ]),
    ...(category === "supplier"
      ? [{ key: "of", label: "Payment Of", exportValue: (r: (typeof rows)[number]) => r.companies?.name ?? "—", display: (r: (typeof rows)[number]) => <span>{r.companies?.name ?? "—"}{r.payment_of ? <span className="block text-[11px] text-text-muted">{r.payment_of}</span> : null}</span> }]
      : []),
    { key: "invoice", label: category === "utility" ? "Bill No." : "Invoice No.", exportValue: (r: (typeof rows)[number]) => r.invoice_number ?? "—" },
    { key: "amount", label: "Amount", exportValue: (r: (typeof rows)[number]) => Number(r.amount), display: (r: (typeof rows)[number]) => formatRM(Number(r.amount)) },
    { key: "due", label: "Due Date", exportValue: (r: (typeof rows)[number]) => dateOrDash(r.due_date) },
    {
      key: "status",
      label: "Status",
      exportValue: (r: (typeof rows)[number]) => `${URGENCY_LABEL[paymentUrgency(r.status, r.due_date, today)]}${r.status !== "paid" && r.paid_so_far > 0 ? ` (part paid ${formatRM(r.paid_so_far)}, balance ${formatRM(Math.max(Number(r.amount) - r.paid_so_far, 0))})` : ""}`,
      display: (r: (typeof rows)[number]) => {
        const u = paymentUrgency(r.status, r.due_date, today);
        const part = r.status !== "paid" && r.paid_so_far > 0;
        return (
          <span className="flex flex-col items-start gap-1">
            <StatusBadge tone={URGENCY_TONE[u]}>{u === "pending" ? URGENCY_LABEL[u] : URGENCY_REMINDER[u]}</StatusBadge>
            {part && <span className="text-[11px] font-semibold text-warning">{`Part paid: ${formatRM(r.paid_so_far)} · balance ${formatRM(Math.max(Number(r.amount) - r.paid_so_far, 0))}`}</span>}
          </span>
        );
      },
    },
    { key: "paid", label: "Paid Date", exportValue: (r: (typeof rows)[number]) => dateOrDash(r.paid_date) },
    { key: "ref", label: "Reference", exportValue: (r: (typeof rows)[number]) => r.payment_reference ?? "—" },
  ];
  const { headers, tableRows } = buildReportRows(rows, columns, (r) => r.id);

  const providerOptions = UTILITY_PROVIDERS;

  return (
    <div className="flex flex-col gap-5">
      {header}

      <PaymentUndoBanner />

      {sp.saved && <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] font-semibold text-success">Payment saved.</div>}

      <form method="get" className="flex flex-wrap items-end gap-3">
        {sp.company && <input type="hidden" name="company" value={sp.company} />}
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Year</label>
          <input type="number" name="year" defaultValue={year} className="mt-1 h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Month</label>
          <Select name="month" defaultValue={allMonths ? "all" : month} className="mt-1 h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="all">All months</option>
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Status</label>
          <Select name="status" defaultValue={sp.status ?? ""} className="mt-1 h-9 w-40 rounded-lg border border-border-strong px-2 text-[13px]">
            {STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">{category === "supplier" ? "Supplier" : category === "rental" ? "Payee" : "Location"}</label>
          <input name="payee" defaultValue={sp.payee ?? ""} placeholder="Search…" className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        {category === "utility" && (
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">Utility Provider</label>
            <Select name="provider" defaultValue={sp.provider ?? ""} className="mt-1 h-9 w-40 rounded-lg border border-border-strong px-2 text-[13px]">
              <option value="">All providers</option>
              {providerOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
        )}
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
      </form>

      <PaymentSummaryCards summary={summary} />
      {summary.pending > 0 && (
        <div className={`rounded-xl border px-4 py-2.5 text-[13px] font-semibold ${summary.overdue > 0 ? "border-danger/40 bg-danger-bg text-danger" : "border-warning/40 bg-warning-bg text-warning"}`}>
          {summary.overdue > 0 ? "🔴 " : "🟡 "}Still to be paid for {monthLabel}: {formatRM(summary.pending)}{summary.overdue > 0 ? ` (of which ${formatRM(summary.overdue)} is overdue)` : ""}
        </div>
      )}

      <SectionCard title={`${monthLabel} – ${title}`}>
        {rows.length === 0 ? (
          <EmptyRow text={allMonths ? "No payments recorded for this year and filter." : "No payments recorded for this month and filter."} />
        ) : (
          <div className="-mx-5 -mb-5">
            <ReportTable filenameBase={`${category}-payments-${year}-${allMonths ? "all" : month}`} headers={headers} rows={tableRows} />
          </div>
        )}
      </SectionCard>

      {notEntered.length > 0 && !sp.status && !sp.payee && !sp.provider && (
        <SectionCard title={`Reference accounts with no amount entered for ${monthLabel} (${notEntered.length})`}>
          <p className="mb-3 text-[12.5px] text-text-secondary">Amounts are never filled in automatically. Enter the amount from the actual {category === "rental" ? "rental invoice / agreement" : "utility bill"}.</p>
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {notEntered.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                <div>
                  <div className="font-semibold text-text">{a.name}{a.utility_type ? <span className="ml-2 text-[11px] font-normal text-text-muted">{UTILITY_TYPE_LABEL[a.utility_type as UtilityType]}</span> : null}</div>
                  <div className="text-xs text-text-muted">{a.provider ? `${a.provider} · ` : ""}{a.bank_name ? `${a.bank_name} ` : ""}{accountDisplay(a.account_no)}</div>
                </div>
                <Link href={`${PATH[category]}/new?account=${a.id}&year=${year}&month=${month}${query ? `&${query}` : ""}`} className="rounded-lg border border-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary">
                  + Enter amount
                </Link>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
