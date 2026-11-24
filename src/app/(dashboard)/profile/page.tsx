import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, ROLE_LABEL } from "@/lib/auth";
import { getHrAccess } from "@/lib/hr/access";
import { EmployeeProfileView } from "@/components/hr/EmployeeProfileView";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";
import { ProfileTabs } from "@/components/hr/ProfileTabs";

/**
 * My Profile: every person sees all of their own details here (the login, and the staff record with the documents, leave, overtime and
 * so on), so nobody has to open the HR section and its list of staff. Only the person's own details are read.
 */
export default async function MyProfilePage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { record } = await searchParams;

  const supabase = await createClient();
  const [{ data: own }, { data: companies }] = await Promise.all([
    supabase.from("employees").select("*, companies(name)").eq("user_id", session.userId).order("full_name"),
    supabase.from("companies").select("id, name").order("name"),
  ]);
  const records = own ?? [];
  const employee = records.find((e) => e.id === record) ?? records[0];
  const companyNames = session.hasAllCompaniesAccess ? "All companies" : (companies ?? []).filter((c) => session.companyIds.includes(c.id)).map((c) => c.name).join(", ") || "—";

  const account = (
    <SectionCard title="My Account">
      <StatRow label="Name" value={session.fullName} />
      <StatRow label="Email" value={session.email || "—"} />
      <StatRow label="Role" value={ROLE_LABEL[session.role]} />
      <StatRow label="Companies" value={companyNames} />
    </SectionCard>
  );

  if (!employee) {
    return (
      <div className="flex flex-col gap-5">
        <div className="text-[20px] font-extrabold text-text">My Profile</div>
      <ProfileTabs active="/profile" record={record} />
        {account}
        <EmptyRow text="Your staff record is not linked to your login yet. Please ask the HR admin to link it, then your staff details, documents, leave and overtime will show here." />
      </div>
    );
  }

  const access = await getHrAccess(supabase, session, [employee.company_id]);

  return (
    <div className="flex flex-col gap-5">
      <div className="text-[20px] font-extrabold text-text">My Profile</div>
      <ProfileTabs active="/profile" record={record} />
      {account}
      {records.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-text-secondary">Staff record</span>
          {records.map((r) => (
            <Link
              key={r.id}
              href={`/profile?record=${r.id}`}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${r.id === employee.id ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}
            >
              {r.companies?.name ?? r.full_name}
            </Link>
          ))}
        </div>
      )}
      <EmployeeProfileView employee={employee} access={access} session={session} supabase={supabase} query="" />
    </div>
  );
}
