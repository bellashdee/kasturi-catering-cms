import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getPayment, listFinanceAudit, listPartPayments } from "@/lib/finance/paymentQueries";
import {
  PAYMENT_CATEGORY_LABEL,
  URGENCY_REMINDER,
  URGENCY_TONE,
  UTILITY_TYPE_LABEL,
  URGENCY_LABEL,
  accountDisplay,
  formatRM,
  paymentUrgency,
  type PaymentCategory,
  type UtilityType,
} from "@/lib/finance/payments";
import { formatMalaysiaDate, formatMalaysiaDateTime } from "@/lib/format";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { MarkPaidForm, VoucherUpload } from "@/components/finance/PaymentActionsPanel";
import { PaymentRowActions } from "@/components/finance/PaymentRowActions";

const PATH: Record<PaymentCategory, string> = {
  supplier: "/finance/supplier-payment",
  rental: "/finance/rental-payment",
  utility: "/finance/utilities-payment",
};

const AUDIT_LABEL: Record<string, string> = {
  payment_created: "Payment created",
  payment_edited: "Payment edited",
  payment_paid: "Marked as paid",
  voucher_uploaded: "Payment voucher uploaded",
  bank_changed: "Bank details changed",
  payment_part_paid: "Part payment recorded",
  restored: "Payment put back (undo of a delete)",
};

function date(value: string | null): string {
  return value ? formatMalaysiaDate(`${value}T12:00:00+08:00`) : "—";
}

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let payment;
  try {
    payment = await getPayment(supabase, id);
  } catch {
    notFound();
  }

  const [audit, parts, approver] = await Promise.all([
    listFinanceAudit(supabase, "finance_payments", id),
    listPartPayments(supabase, id),
    payment.approved_by ? supabase.from("profiles").select("full_name").eq("id", payment.approved_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const today = todayInMalaysia();
  const totalAmount = Number(payment.amount);
  const paidSoFar = Math.round(parts.reduce((t, x) => t + Number(x.amount), 0) * 100) / 100;
  const balance = payment.status === "paid" ? 0 : Math.round(Math.max(totalAmount - paidSoFar, 0) * 100) / 100;
  const urgency = paymentUrgency(payment.status, payment.due_date, today);
  const category = payment.category as PaymentCategory;
  const month = new Date(`${payment.period_month}T12:00:00+08:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
  const [py, pm] = payment.period_month.split("-");
  const backHref = `${PATH[category]}?year=${py}&month=${Number(pm)}`;
  const labelClass = "text-[11px] font-bold uppercase tracking-wide text-text-muted";

  const details: [string, string][] = [
    [category === "utility" ? "Location / Account Name" : category === "rental" ? "Rental / Payee" : "Supplier Name", payment.payee_name],
    ["Payment Of", payment.companies?.name ?? "—"],
    ...(category === "supplier" ? ([["In payment of", payment.payment_of ?? "—"]] as [string, string][]) : []),
    ...(category === "utility"
      ? ([
          ["Utility Provider", payment.utility_provider ?? "—"],
          ["Utility Type", payment.utility_type ? UTILITY_TYPE_LABEL[payment.utility_type as UtilityType] : "—"],
        ] as [string, string][])
      : []),
    ["Bank Name", payment.bank_name ?? "—"],
    [category === "utility" ? "Account No." : "Bank Account Number", accountDisplay(payment.account_no)],
    [category === "utility" ? "Billing Month" : category === "rental" ? "Rental Month" : "Payment Month", month],
    [category === "utility" ? "Bill Number" : "Invoice Number", payment.invoice_number ?? "—"],
    [category === "utility" ? "Bill Date" : "Invoice Date", date(payment.invoice_date)],
    ["Amount to Pay", formatRM(Number(payment.amount))],
    ["Due Date", date(payment.due_date)],
    ["Approved by", approver.data?.full_name ?? "—"],
    ["Payment Voucher No.", payment.voucher_number ?? "—"],
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={backHref} className="text-[12.5px] font-semibold text-text-secondary">← Back to {PAYMENT_CATEGORY_LABEL[category]}</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-extrabold text-text">{payment.payee_name}</h1>
            <p className="mt-0.5 text-[13px] text-text-secondary">{PAYMENT_CATEGORY_LABEL[category]} · {month} · {payment.companies?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {payment.status !== "paid" && paidSoFar > 0 && <StatusBadge tone="warning">Part paid</StatusBadge>}
            <StatusBadge tone={URGENCY_TONE[urgency]}>{urgency === "pending" ? URGENCY_LABEL[urgency] : URGENCY_REMINDER[urgency]}</StatusBadge>
            <PaymentRowActions id={id} after={backHref} />
          </div>
        </div>
      </div>

      {urgency !== "paid" && (
        <div className={`rounded-xl border px-4 py-3 text-[13.5px] font-bold ${urgency === "overdue" ? "border-danger/40 bg-danger-bg text-danger" : "border-warning/40 bg-warning-bg text-warning"}`}>
          {URGENCY_REMINDER[urgency] === "PENDING" ? "Payment pending" : URGENCY_REMINDER[urgency]} — {formatRM(balance)} still to be paid (due {date(payment.due_date)}).{paidSoFar > 0 ? ` Paid so far ${formatRM(paidSoFar)} of ${formatRM(totalAmount)}.` : ""}
        </div>
      )}

      <SectionCard title="Payment Details">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className={labelClass}>{label}</dt>
              <dd className="mt-0.5 font-semibold text-text">{value}</dd>
            </div>
          ))}
          <div>
            <dt className={labelClass}>Payment Status</dt>
            <dd className="mt-0.5 font-semibold text-text">{payment.status === "paid" ? "Paid" : "Not paid yet"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Actual Payment Date</dt>
            <dd className="mt-0.5 font-semibold text-text">{date(payment.paid_date)}</dd>
          </div>
          <div>
            <dt className={labelClass}>Payment Reference</dt>
            <dd className="mt-0.5 font-semibold text-text">{payment.status === "paid" ? (payment.payment_reference ?? "—") : parts.length > 0 ? parts.map((x) => x.reference_number).filter(Boolean).join(", ") || "—" : "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className={labelClass}>Remarks</dt>
            <dd className="mt-0.5 text-text">{payment.remarks || "—"}</dd>
          </div>
        </dl>
      </SectionCard>

      {parts.length > 0 && (
        <SectionCard title="Payments made">
          <div className="-mx-5 -mt-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-1.5">Date</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5">Reference</th>
                  <th className="px-2 py-1.5">Note</th>
                  <th className="px-5 py-1.5">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((x) => (
                  <tr key={x.id} className="border-t border-border align-top">
                    <td className="px-5 py-2">{date(x.payment_date)}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatRM(Number(x.amount))}</td>
                    <td className="px-2 py-2">{x.reference_number ?? "—"}</td>
                    <td className="px-2 py-2 text-text-secondary">{x.notes || "—"}</td>
                    <td className="px-5 py-2">{x.receipt_document_id ? <DocumentViewLink documentId={x.receipt_document_id} /> : <span className="text-text-muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
            <span>Amount to pay: <strong>{formatRM(totalAmount)}</strong></span>
            <span>Paid so far: <strong>{formatRM(payment.status === "paid" ? totalAmount : paidSoFar)}</strong></span>
            <span className={balance > 0 ? "font-bold text-danger" : "font-bold text-success"}>Balance to pay: {formatRM(balance)}</span>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Documents">
        <dl className="grid grid-cols-3 gap-x-6 gap-y-3 text-[13px]">
          <div>
            <dt className={labelClass}>{category === "utility" ? "Bill" : category === "rental" ? "Agreement / invoice" : "Invoice"}</dt>
            <dd className="mt-0.5">{payment.document_id ? <DocumentViewLink documentId={payment.document_id} /> : <span className="text-text-muted">None</span>}</dd>
          </div>
          <div>
            <dt className={labelClass}>Payment Voucher</dt>
            <dd className="mt-0.5">{payment.voucher_document_id ? <DocumentViewLink documentId={payment.voucher_document_id} /> : <span className="text-text-muted">None</span>}</dd>
          </div>
          <div>
            <dt className={labelClass}>Payment Proof</dt>
            <dd className="mt-0.5">{payment.proof_document_id ? <DocumentViewLink documentId={payment.proof_document_id} /> : <span className="text-text-muted">None</span>}</dd>
          </div>
        </dl>
      </SectionCard>

      {(payment.status !== "paid" || payment.paid_details_pending) && (
        <SectionCard title={payment.paid_details_pending ? "Add Amount Paid, Payment Date & Reference (marked as paid in the checklist)" : "Mark as Paid / Part Payment"}>
          <MarkPaidForm paymentId={id} companyId={payment.company_id} maxDate={today} total={totalAmount} paidSoFar={paidSoFar} detailsPending={payment.status === "paid" && payment.paid_details_pending} />
        </SectionCard>
      )}

      <SectionCard title={payment.voucher_document_id ? "Replace Payment Voucher" : "Upload Payment Voucher"}>
        <VoucherUpload paymentId={id} companyId={payment.company_id} companyName={payment.companies?.name ?? ""} currentVoucherNo={payment.voucher_number} />
      </SectionCard>

      <SectionCard title="Audit Trail">
        {audit.length === 0 ? (
          <p className="text-[13px] text-text-muted">No history yet.</p>
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {audit.map((e) => (
              <div key={e.id} className="px-5 py-2.5 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text">{AUDIT_LABEL[e.action] ?? e.action}</span>
                  <span className="text-text-muted">{formatMalaysiaDateTime(e.created_at)}</span>
                </div>
                <div className="text-text-secondary">
                  {e.performerName ?? "System"}
                  {e.new_value ? ` · ${e.new_value}` : ""}
                  {e.reason ? ` · ${e.reason}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
