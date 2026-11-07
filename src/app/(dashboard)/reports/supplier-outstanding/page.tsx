import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds, listSupplierOwed } from "@/lib/finance/paymentQueries";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { formatCurrency } from "@/lib/format";
import { buildReportRows } from "@/lib/reports/buildRows";
import { ReportTable } from "@/components/reports/ReportTable";
import { EmptyRow } from "@/components/dashboard/SectionCard";

type Cell = { amount: number; overdue: boolean };
type Row = { key: string; name: string; cells: Map<string, Cell>; total: number; overdue: number; isTotal?: boolean };

const monthKey = (periodMonth: string) => periodMonth.slice(0, 7);
const monthLabel = (key: string) => `${MONTH_LABEL[Number(key.slice(5, 7)) - 1].slice(0, 3)} ${key.slice(0, 4)}`;
const normalName = (name: string) => name.toUpperCase().replace(/\s+/g, " ").trim();
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Supplier Outstanding Report: what is still owed to each supplier, month by month — the monthly summary of the supplier's statement of account
 * as it is keyed in Finance when the payment voucher is issued. Not the daily invoices. Red = past its due date. Finance / Admin only.
 */
export default async function SupplierOutstandingReportPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const header = (subtitle: string) => (
    <div>
      <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Supplier Outstanding Report</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">{subtitle}</p>
    </div>
  );

  const adminIds = await adminCompanyIds(supabase, targetCompanyIds);
  if (adminIds.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header("Supplier payments by month")}
        <EmptyRow text="This report holds the supplier payments and is only available to Finance / Admin users of the company." />
      </div>
    );
  }

  const today = todayInMalaysia();
  const owed = await listSupplierOwed(supabase, adminIds);
  const months = Array.from(new Set(owed.map((r) => monthKey(r.period_month)))).sort();

  const bySupplier = new Map<string, Row>();
  for (const r of owed) {
    const key = normalName(r.payee_name);
    const row = bySupplier.get(key) ?? { key, name: r.payee_name.trim(), cells: new Map<string, Cell>(), total: 0, overdue: 0 };
    const m = monthKey(r.period_month);
    const cell = row.cells.get(m) ?? { amount: 0, overdue: false };
    const late = !!r.due_date && r.due_date < today;
    cell.amount += r.balance;
    cell.overdue = cell.overdue || late;
    row.cells.set(m, cell);
    row.total += r.balance;
    if (late) row.overdue += r.balance;
    bySupplier.set(key, row);
  }
  const suppliers = Array.from(bySupplier.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const totalRow: Row = { key: "TOTAL", name: "TOTAL", cells: new Map(), total: 0, overdue: 0, isTotal: true };
  for (const s of suppliers) {
    totalRow.total += s.total;
    totalRow.overdue += s.overdue;
    for (const [m, c] of s.cells) {
      const t = totalRow.cells.get(m) ?? { amount: 0, overdue: false };
      t.amount += c.amount;
      t.overdue = t.overdue || c.overdue;
      totalRow.cells.set(m, t);
    }
  }

  const money = (v: number, late = false, bold = false) =>
    v === 0 ? <span className="text-text-muted">—</span> : <span className={late ? "font-semibold text-danger" : bold ? "font-semibold text-text" : ""}>{formatCurrency(v)}</span>;

  const { headers, tableRows } = buildReportRows(
    suppliers.length > 0 ? [...suppliers, totalRow] : [],
    [
      { key: "supplier", label: "Supplier", exportValue: (r: Row) => r.name, display: (r: Row) => <span className={r.isTotal ? "font-bold text-text" : "font-semibold text-text"}>{r.name}</span> },
      ...months.map((m) => ({
        key: m,
        label: monthLabel(m),
        exportValue: (r: Row) => round2(r.cells.get(m)?.amount ?? 0),
        display: (r: Row) => money(r.cells.get(m)?.amount ?? 0, r.cells.get(m)?.overdue ?? false, r.isTotal),
      })),
      { key: "total", label: "Total Owed", exportValue: (r: Row) => round2(r.total), display: (r: Row) => <span className="font-bold text-text">{formatCurrency(r.total)}</span> },
      { key: "late", label: "Of Which Overdue", exportValue: (r: Row) => round2(r.overdue), display: (r: Row) => money(r.overdue, r.overdue > 0) },
    ],
    (r: Row) => r.key,
  );

  return (
    <div className="flex flex-col gap-5">
      {header(`${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"} · ${formatCurrency(totalRow.total)} outstanding · ${formatCurrency(totalRow.overdue)} overdue`)}
      <p className="text-[12.5px] text-text-secondary">
        By month, as keyed in <Link href={`/reports/finance-payments${query}`} className="font-semibold text-primary underline">Finance → Supplier Payment</Link> from the supplier&apos;s statement of account (SOA) when the payment voucher is issued.
        Each figure is the month of the statement; red is past its due date.
      </p>
      <ReportTable filenameBase="supplier-outstanding-by-month" headers={headers} rows={tableRows} emptyText="No supplier payment is waiting to be paid." />
    </div>
  );
}
