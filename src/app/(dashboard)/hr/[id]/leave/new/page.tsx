import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getEmployee } from "@/lib/hr/queries";
import { LeaveRequestForm } from "@/components/hr/LeaveRequestForm";

export default async function NewLeavePage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/hr/${id}`} className="text-[12.5px] font-semibold text-text-secondary">
        ← Back to {employee.full_name}
      </Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Request Leave</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <LeaveRequestForm employeeId={id} companyId={employee.company_id} />
      </div>
    </div>
  );
}
