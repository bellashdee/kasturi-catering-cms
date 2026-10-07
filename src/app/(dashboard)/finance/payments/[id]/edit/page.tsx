import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getPayment } from "@/lib/finance/paymentQueries";
import { PaymentEditForm } from "@/components/finance/PaymentEditForm";
import type { PaymentCategory } from "@/lib/finance/payments";

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/finance/payments/${id}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to payment</Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Edit Payment — {payment.payee_name}</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">Every change, including bank details, is recorded in the audit trail.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <PaymentEditForm
          paymentId={id}
          redirectTo={`/finance/payments/${id}`}
          initial={{
            companyId: payment.company_id,
            companyName: payment.companies?.name ?? "",
            category: payment.category as PaymentCategory,
            payeeName: payment.payee_name,
            bankName: payment.bank_name ?? "",
            accountNo: payment.account_no ?? "",
            paymentOf: payment.payment_of ?? "",
            periodMonth: payment.period_month.slice(0, 7),
            invoiceNumber: payment.invoice_number ?? "",
            invoiceDate: payment.invoice_date ?? "",
            dueDate: payment.due_date ?? "",
            priority: (payment.priority as "high" | "medium" | "low" | null) ?? "",
            amount: String(payment.amount),
            voucherNumber: payment.voucher_number ?? "",
            remarks: payment.remarks ?? "",
            utilityProvider: payment.utility_provider ?? "",
            utilityLocation: payment.utility_location ?? "",
          }}
        />
      </div>
    </div>
  );
}
