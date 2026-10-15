import { GuestLanguageBar } from "@/components/i18n/GuestLanguageBar";
import { notFound } from "next/navigation";
import { INTAKE_COMPANIES } from "@/lib/catering/intake";
import { PublicPaymentProofForm } from "@/components/finance/PublicPaymentProofForm";

export const metadata = { title: "Customer Payment Proof" };

export default async function PaymentProofFormPage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params;
  const company = INTAKE_COMPANIES[slug];
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <GuestLanguageBar />
      <div className="text-[13px] font-bold uppercase tracking-wide text-text-secondary">{company.name}</div>
      <h1 className="mt-1 text-[24px] font-extrabold text-text">Customer Payment Proof</h1>
      <p className="mt-1 text-[14px] text-text-secondary">
        When a customer has paid, send the proof here with the invoice number. Our office will check it and record the payment.
      </p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <PublicPaymentProofForm companySlug={slug} />
      </div>
    </div>
  );
}
