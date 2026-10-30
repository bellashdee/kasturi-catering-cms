import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, ROLE_LABEL } from "@/lib/auth";
import { listMembers } from "@/lib/users/queries";
import { ASSIGNABLE_MODULES } from "@/lib/modules";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { AddMemberForm } from "@/components/settings/AddMemberForm";
import { MemberActions } from "@/components/settings/MemberActions";
import { DisplaySettings } from "@/components/settings/DisplaySettings";

export default async function SettingsPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  if (session.role !== "super_admin" || !session.hasAllCompaniesAccess) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-[22px] font-extrabold text-text">Settings</h1>
        <SectionCard title="Display">
          <DisplaySettings />
        </SectionCard>
        <EmptyRow text="Only a Super Admin can manage team members." />
      </div>
    );
  }

  const members = await listMembers(supabase);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Settings</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Add, edit, or remove team members and their access — internal use only, no public sign-up.
          </p>
        </div>
        <AddMemberForm companies={companies} />
      </div>

      <SectionCard title="Display">
        <DisplaySettings />
      </SectionCard>

      <SectionCard title={`Team Members (${members.length})`}>
        {members.length === 0 ? (
          <EmptyRow text="No one has access yet." />
        ) : (
          <div className="-mx-5 -mb-5">
            <div className="grid grid-cols-5 gap-4 border-b border-border px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Name</div>
              <div>Username</div>
              <div>Email</div>
              <div>Role / Company</div>
              <div></div>
            </div>
            {members.map((m) => {
              const rows = m.user_company_access;
              const access = rows.find((r) => r.company_id === null) ?? rows[0];
              const hasAll = rows.some((r) => r.company_id === null);
              const companyLabel = hasAll ? "All Companies" : rows.map((r) => r.companies?.name).filter(Boolean).join(", ");
              return (
                <div key={m.id} className="grid grid-cols-5 items-center gap-4 border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                  <div className="font-semibold text-text">
                    {m.full_name}
                    {!m.is_active && <span className="ml-2 text-xs text-text-muted">(inactive)</span>}
                  </div>
                  <div className="text-text-secondary">{m.username ?? "—"}</div>
                  <div className="text-text-secondary">{m.email}</div>
                  <div className="text-text-secondary">
                    {access ? `${ROLE_LABEL[access.role]} · ${companyLabel}` : "No access yet"}
                    {access?.allowed_modules && (
                      <div className="mt-0.5 text-[11.5px] text-text-muted">Modules: {access.allowed_modules.map((k) => ASSIGNABLE_MODULES.find((m) => m.key === k)?.label ?? k).join(", ")}</div>
                    )}
                  </div>
                  <MemberActions
                    userId={m.id}
                    companies={companies}
                    initial={{
                      fullName: m.full_name,
                      username: m.username ?? "",
                      role: access?.role ?? "staff",
                      allCompanies: hasAll,
                      companyIds: rows.map((r) => r.company_id).filter((id): id is string => id !== null),
                      allowedModules: access?.allowed_modules ?? null,
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
