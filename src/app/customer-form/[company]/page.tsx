import { GuestLanguageBar } from "@/components/i18n/GuestLanguageBar";
import { notFound } from "next/navigation";
import { INTAKE_COMPANIES } from "@/lib/catering/intake";
import { PublicCustomerForm } from "@/components/catering/PublicCustomerForm";

export const metadata = { title: "Customer Details Form" };

export default async function CustomerFormPage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params;
  const company = INTAKE_COMPANIES[slug];
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <GuestLanguageBar />
      <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">{company.name}</div>
      <h1 className="mt-1 text-[22px] font-extrabold text-text">Customer Details Form</h1>
      <p className="mt-1 text-[13px] text-text-secondary">
        Fill in your customer&apos;s details. Our office will check them before they are added to the system.
      </p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <PublicCustomerForm companySlug={slug} />
      </div>
    </div>
  );
}
