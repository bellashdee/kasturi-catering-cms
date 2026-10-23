import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEmployee } from "@/lib/hr/queries";
import { CertificateUploadReview } from "@/components/hr/CertificateUploadReview";
import { getHrAccess } from "@/lib/hr/access";

export default async function NewCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let employee;
  try {
    employee = await getEmployee(supabase, id);
  } catch {
    notFound();
  }
  const access = await getHrAccess(supabase, session, [employee.company_id]);
  if (!access.isAdminOf(employee.company_id)) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/hr/${id}`} className="text-[12.5px] font-semibold text-text-secondary">
        ← Back to {employee.full_name}
      </Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Upload Staff Document</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">
        Food handling certificate, typhoid certificate, work permit or training record.
      </p>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <CertificateUploadReview employeeId={id} companyId={employee.company_id} />
      </div>
    </div>
  );
}
