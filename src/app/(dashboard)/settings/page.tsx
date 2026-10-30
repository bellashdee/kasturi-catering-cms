import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, ROLE_LABEL } from "@/lib/auth";
import { listMembers } from "@/lib/users/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { ASSIGNABLE_MODULES } from "@/lib/modules";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { AddMemberForm } from "@/components/settings/AddMemberForm";
import { MemberActions } from "@/components/settings/MemberActions";
import { DisplaySettings } from "@/components/settings/DisplaySettings";

const NO_EMAIL_DOMAIN = "@no-email.invalid";

/** user id -> the starting password (USERNAME2026) of accounts made without an email that have never been used or changed. */
async function loadInitialPasswords(members: Awaited<ReturnType<typeof listMembers>>) {
  const out = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const byId = new Map((data?.users ?? []).map((u) => [u.id, u]));
    for (const m of members) {
      const u = byId.get(m.id);
      if (!u || !m.username || !u.email?.endsWith(NO_EMAIL_DOMAIN) || u.last_sign_in_at) continue;
      if (Math.abs(Date.parse(u.updated_at ?? u.created_at) - Date.parse(u.created_at)) > 10_000) continue;
      out.set(m.id, `${m.username.trim()}2026`);
    }
  } catch {
    /* the list is still shown, without the starting passwords */
  }
  return out;
}

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

  // Separate by company: a person who works in several companies is one account and is listed under each of their companies.
  // The people who can open every company (the Super Admins, the company admins) are listed first.
  const groups: { key: string; title: string; members: typeof members }[] = [
    { key: "all", title: "All Companies", members: members.filter((m) => m.user_company_access.some((r) => r.company_id === null) || m.user_company_access.length === 0) },
    ...companies.map((c) => ({ key: c.id, title: c.name, members: members.filter((m) => !m.user_company_access.some((r) => r.company_id === null) && m.user_company_access.some((r) => r.company_id === c.id)) })),
  ].filter((g) => g.members.length > 0);

  // The password given when the account was made is shown only until the person signs in for the first time (and only if nobody has changed it since).
  const initialPasswords = await loadInitialPasswords(members);

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
          <div className="-mx-5 -mb-5 flex flex-col">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="flex items-baseline gap-2 border-y border-border bg-surface-alt px-5 py-2.5">
                  <span className="text-[13px] font-extrabold text-text">{g.title}</span>
                  <span className="text-[12px] text-text-muted">{g.members.length} {g.members.length === 1 ? "person" : "people"}</span>
                </div>
                <div className="grid grid-cols-5 gap-4 border-b border-border px-5 py-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <div>Name</div>
                  <div>Username</div>
                  <div>Password</div>
                  <div>Role / Company</div>
                  <div></div>
                </div>
                {g.members.map((m) => {
                  const rows = m.user_company_access;
                  const access = rows.find((r) => r.company_id === null) ?? rows[0];
                  const hasAll = rows.some((r) => r.company_id === null);
                  const companyLabel = hasAll ? "All Companies" : rows.map((r) => r.companies?.name).filter(Boolean).join(", ");
                  const hasEmail = !!m.email && !m.email.endsWith(NO_EMAIL_DOMAIN);
                  const initialPassword = initialPasswords.get(m.id);
                  return (
                    <div key={`${g.key}-${m.id}`} className="grid grid-cols-5 items-center gap-4 border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                      <div>
                        <div className="font-semibold text-text">
                          {m.full_name}
                          {!m.is_active && <span className="ml-2 text-xs text-text-muted">(inactive)</span>}
                        </div>
                        {hasEmail && <div className="mt-0.5 break-all text-[12px] text-text-muted">{m.email}</div>}
                      </div>
                      <div className="font-semibold text-text-secondary">{m.username ?? "—"}</div>
                      <div className="text-text-secondary">
                        {initialPassword ? (
                          <>
                            <span className="font-mono font-semibold text-text">{initialPassword}</span>
                            <div className="mt-0.5 text-[11.5px] text-text-muted">Not signed in yet</div>
                          </>
                        ) : (
                          <span className="text-[12.5px] text-text-muted">Set by the person (use Edit to set a new one)</span>
                        )}
                      </div>
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
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
