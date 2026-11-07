import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { formatCurrency } from "@/lib/format";
import { monthLabel, nextMonthStart, voucherMonth } from "@/lib/procurement/vouchers";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { CreateAllVouchersButton, CreateVoucherButton } from "@/components/procurement/VoucherActions";

type Row = { companyId: string; supplierId: string; invoices: number; invoiceTotal: number; credit: number; debit: number };

export default async function VouchersPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { company: requestedId, month } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const query = requestedId ? `company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const monthStart = voucherMonth(month);
  const end = nextMonthStart(monthStart);

  const [{ data: invoices }, { data: notes }, { data: vouchers }, { data: suppliers }] = await Promise.all([
    supabase.from("supplier_invoices").select("company_id, supplier_id, amount").in("company_id", targetCompanyIds).gte("invoice_date", monthStart).lt("invoice_date", end),
    supabase.from("supplier_notes").select("company_id, supplier_id, note_type, amount").in("company_id", targetCompanyIds).gte("note_date", monthStart).lt("note_date", end),
    supabase.from("supplier_payment_vouchers").select("id, company_id, supplier_id, voucher_number, status, net_amount").in("company_id", targetCompanyIds).eq("period_month", monthStart),
    supabase.from("suppliers").select("id, name").in("company_id", targetCompanyIds),
  ]);

  const rows = new Map<string, Row>();
  const rowFor = (companyId: string, supplierId: string) => {
    const key = `${companyId}|${supplierId}`;
    if (!rows.has(key)) rows.set(key, { companyId, supplierId, invoices: 0, invoiceTotal: 0, credit: 0, debit: 0 });
    return rows.get(key)!;
  };
  for (const i of invoices ?? []) {
    const r = rowFor(i.company_id, i.supplier_id);
    r.invoices += 1;
    r.invoiceTotal += Number(i.amount);
  }
  for (const n of notes ?? []) {
    const r = rowFor(n.company_id, n.supplier_id);
    if (n.note_type === "credit") r.credit += Number(n.amount);
    else r.debit += Number(n.amount);
  }
  const nameOf = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const voucherOf = new Map((vouchers ?? []).map((v) => [`${v.company_id}|${v.supplier_id}`, v]));
  const list = [...rows.values()].sort((a, b) => (nameOf.get(a.supplierId) ?? "").localeCompare(nameOf.get(b.supplierId) ?? ""));
  const missing = list.filter((r) => !voucherOf.has(`${r.companyId}|${r.supplierId}`)).length;
  const net = (r: Row) => r.invoiceTotal - r.credit + r.debit;
  const grand = list.reduce((t, r) => t + net(r), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Payment vouchers for {monthLabel(monthStart)} · {list.length} supplier{list.length === 1 ? "" : "s"} · {formatCurrency(grand)} to pay
          </p>
        </div>
        {targetCompanyIds.length === 1 && <CreateAllVouchersButton companyId={targetCompanyIds[0]} monthStart={monthStart} missing={missing} />}
      </div>

      <SupplierProcurementSubNav />

      <form method="get" className="flex flex-wrap items-end gap-2">
        {requestedId && <input type="hidden" name="company" value={requestedId} />}
        <label className="text-[12.5px] font-semibold text-text-secondary">
          Month
          <input type="month" name="month" defaultValue={monthStart.slice(0, 7)} className="mt-1 block h-9 rounded-lg border border-border-strong px-2.5 text-[13px]" />
        </label>
        <button type="submit" className="h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt">
          Show
        </button>
        <span className="pb-2 text-[12.5px] text-text-muted">A voucher adds up the supplier&apos;s invoices and credit / debit notes dated in that month.</span>
      </form>

      {list.length === 0 ? (
        <EmptyRow text={`No supplier invoice or note dated in ${monthLabel(monthStart)}.`} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[12.5px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3">Supplier</th>
                <th className="px-3 py-3 text-right">Invoices</th>
                <th className="px-3 py-3 text-right">Invoice total (RM)</th>
                <th className="px-3 py-3 text-right">Credit (RM)</th>
                <th className="px-3 py-3 text-right">Debit (RM)</th>
                <th className="px-3 py-3 text-right">To pay (RM)</th>
                <th className="px-5 py-3 text-right">Voucher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((r) => {
                const v = voucherOf.get(`${r.companyId}|${r.supplierId}`);
                return (
                  <tr key={`${r.companyId}|${r.supplierId}`}>
                    <td className="px-5 py-3 font-semibold text-text">{nameOf.get(r.supplierId) ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-text-secondary">{r.invoices}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-text">{r.invoiceTotal.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-text-secondary">{r.credit > 0 ? `-${r.credit.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-text-secondary">{r.debit > 0 ? r.debit.toFixed(2) : "—"}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-text">{net(r).toFixed(2)}</td>
                    <td className="px-5 py-3 text-right">
                      {v ? (
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge tone={v.status === "paid" ? "success" : "warning"}>{v.status === "paid" ? "Paid" : "Issued"}</StatusBadge>
                          <Link href={`/supplier-procurement/vouchers/${v.id}${query ? `?${query}` : ""}`} className="font-semibold text-text underline">
                            {v.voucher_number}
                          </Link>
                        </span>
                      ) : (
                        <CreateVoucherButton companyId={r.companyId} supplierId={r.supplierId} monthStart={monthStart} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
