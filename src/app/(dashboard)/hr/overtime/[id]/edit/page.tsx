import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getOvertime } from "@/lib/hr/otQueries";
import { listOtStaffOptions } from "@/lib/hr/otStaff";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { OvertimeForm } from "@/components/hr/OvertimeForm";

export default async function EditOvertimePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let ot;
  try {
    ot = await getOvertime(supabase, id);
  } catch {
    notFound();
  }
  if (ot.status !== "draft") redirect(`/hr/overtime/${id}`);

  const staff = await listOtStaffOptions(supabase, [ot.company_id], session.userId);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/hr/overtime/${id}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to OT</Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Edit OT Draft</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <OvertimeForm
          staff={staff}
          overtimeId={id}
          maxDate={todayInMalaysia()}
          initial={{
            employeeId: ot.employee_id,
            workDate: ot.work_date,
            normalWorkingHours: ot.normal_working_hours !== null ? String(ot.normal_working_hours) : "8",
            otStartTime: ot.ot_start_time?.slice(0, 5) ?? "",
            otEndTime: ot.ot_end_time?.slice(0, 5) ?? "",
            reason: ot.reason ?? "",
            documentId: ot.document_id,
          }}
        />
      </div>
    </div>
  );
}
