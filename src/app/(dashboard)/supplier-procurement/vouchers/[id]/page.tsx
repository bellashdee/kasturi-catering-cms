import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { linesFromJson, monthLabel } from "@/lib/procurement/vouchers";
import { PrintDocumentButton } from "@/components/shared/PrintDocumentButton";
import { VoucherDetailActions } from "@/components/procurement/VoucherActions";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard } from "@/components/dashboard/SectionCard";

export default async function VoucherDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();
  const { data: v } = await supabase
    .from("supplier_payment_vouchers")
    .select("*, suppliers(id, name, billing_address, phone, registration_no, payment_terms), companies(name, legal_name, registration_no)")
    .eq("id", id)
    .maybeSingle();
  if (!v) notFound();

  const lines = linesFromJson(v.lines);
  const isPaid = v.status === "paid";
  const listHref = `/supplier-procurement/vouchers?month=${v.period_month.slice(0, 7)}${requestedId ? `&company=${requestedId}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={listHref} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Payment Vouchers
          </Link>
          <div className="mt-2 flex items-center gap-2 text-[20px] font-extrabold text-text">
            {v.voucher_number}
            <StatusBadge tone={isPaid ? "success" : "warning"}>{isPaid ? "Paid" : "Issued"}</StatusBadge>
          </div>
          <div className="text-[13px] text-text-secondary">
            {v.companies?.name} · {v.suppliers?.name} · for {monthLabel(v.period_month)} · dated {v.voucher_date}
            {isPaid && v.paid_date && ` · paid ${v.paid_date}${v.payment_reference ? ` (${v.payment_reference})` : ""}`}
          </div>
          {v.notes && <div className="mt-1 text-[13px] text-text-secondary">{v.notes}</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <PrintDocumentButton
            document={{
              type: "PAYMENT VOUCHER",
              number: v.voucher_number,
              date: v.voucher_date,
              terms: v.suppliers?.payment_terms,
              company: { name: v.companies?.legal_name || v.companies?.name || "", registrationNo: v.companies?.registration_no },
              party: { label: "PAY TO (SUPPLIER)", name: v.suppliers?.name ?? "", address: v.suppliers?.billing_address, phone: v.suppliers?.phone, registrationNo: v.suppliers?.registration_no },
              remarks: [`Payment for ${monthLabel(v.period_month)}`, v.notes, isPaid && v.paid_date ? `Paid ${v.paid_date}${v.payment_reference ? ` ref ${v.payment_reference}` : ""}` : null].filter(Boolean).join(". "),
              lines: lines.map((l) => ({ code: l.date.split("-").reverse().join("/"), description: l.description, quantity: 1, unitPrice: l.amount, amount: l.amount })),
            }}
          />
          <VoucherDetailActions voucherId={id} status={v.status} voucherDate={v.voucher_date} notes={v.notes ?? ""} paidDate={v.paid_date} paymentReference={v.payment_reference} listHref={`/supplier-procurement/vouchers${query}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Invoices", formatCurrency(Number(v.invoices_total))],
          ["Credit notes", Number(v.credit_total) > 0 ? `-${formatCurrency(Number(v.credit_total))}` : formatCurrency(0)],
          ["Debit notes", formatCurrency(Number(v.debit_total))],
          ["To pay", formatCurrency(Number(v.net_amount))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</div>
            <div className="mt-1 text-xl font-extrabold text-text">{value}</div>
          </div>
        ))}
      </div>

      <SectionCard title={`What is paid (${lines.length})`}>
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full min-w-[480px] text-[14px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[12.5px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3">Date</th>
                <th className="px-3 py-3">Document</th>
                <th className="px-5 py-3 text-right">Amount (RM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => (
                <tr key={`${l.kind}-${l.ref}-${i}`}>
                  <td className="px-5 py-3 text-text-secondary">{l.date}</td>
                  <td className="px-3 py-3 font-semibold text-text">{l.description}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums text-text">{l.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-alt">
                <td colSpan={2} className="px-5 py-3 text-right font-bold text-text">To pay</td>
                <td className="px-5 py-3 text-right text-[15px] font-extrabold tabular-nums text-text">{Number(v.net_amount).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
