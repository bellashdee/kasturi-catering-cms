import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { LeaveKeyIn } from "@/components/hr/LeaveKeyIn";

/** Key in the leave of another staff member (a paper form or a message). For the admins and the leave editors (Ms. Syaza, Mr. Adlan, Ms. Nabilah). */
export default async function KeyInLeavePage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const [{ data: isSuper }, { data: isEditor }] = await Promise.all([supabase.rpc("current_user_is_super_admin"), supabase.rpc("user_is_leave_editor")]);
  if (isSuper !== true && isEditor !== true) redirect("/hr/leave");

  const { data: staff } = await supabase.from("employees").select("id, full_name, company_id, companies(name)").eq("status", "active").order("full_name");
  const options = (staff ?? []).map((e) => ({ id: e.id, companyId: e.company_id, label: `${e.full_name} - ${e.companies?.name ?? ""}` }));

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/hr/leave" className="text-[12.5px] font-semibold text-text-secondary">
        ← Back to Leave Requests
      </Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Key in leave for staff</h1>
      <p className="mt-0.5 text-[13px] text-text-secondary">Choose the staff member and type in their leave. Their name appears once for every company they work in: pick the company the leave belongs to.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <LeaveKeyIn staff={options} />
      </div>
    </div>
  );
}
