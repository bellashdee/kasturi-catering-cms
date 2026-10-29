import { GuestLanguageBar } from "@/components/i18n/GuestLanguageBar";
import { notFound } from "next/navigation";
import { INTAKE_COMPANIES } from "@/lib/catering/intake";
import { PublicQuotationForm } from "@/components/catering/PublicQuotationForm";
import { QuotationFormTutorial } from "@/components/catering/QuotationFormTutorial";

export const metadata = { title: "Quotation Request Form" };

export default async function QuotationFormPage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params;
  const company = INTAKE_COMPANIES[slug];
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <GuestLanguageBar />
      <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">{company.name}</div>
      <h1 className="mt-1 text-[22px] font-extrabold text-text">Quotation Request Form</h1>
      <p className="mt-1 text-[13px] text-text-secondary">
        Fill in the event and the menu for each day. Our office will check it and prepare the quotation.
      </p>
      <div className="mt-3">
        <QuotationFormTutorial />
      </div>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <PublicQuotationForm companySlug={slug} />
      </div>
    </div>
  );
}
