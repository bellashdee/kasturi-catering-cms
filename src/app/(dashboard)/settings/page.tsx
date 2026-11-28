import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, ROLE_LABEL } from "@/lib/auth";
import { listMembers } from "@/lib/users/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { ASSIGNABLE_MODULES } from "@/lib/modules";
import { mergeAllowedSections, sectionSummary } from "@/lib/sections";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SettingsDisclosure, SettingsGroup, SettingsLink, SettingsProfileCard, SettingsRow } from "@/components/settings/SettingsList";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ThemeSetting } from "@/components/settings/ThemeSetting";
import { DataManagement } from "@/components/settings/DataManagement";
import { AddMemberForm } from "@/components/settings/AddMemberForm";
import { MemberActions } from "@/components/settings/MemberActions";
import { DisplaySettings } from "@/components/settings/DisplaySettings";
import { PushToggle } from "@/components/settings/PushToggle";
import { TeamMemberFilters, type StaffKind } from "@/components/settings/TeamMemberFilters";
import { isForeigner } from "@/lib/hr/birthdays";

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

/** Profile, Account and Preferences: the same for everyone (the grouped-list look of a phone's settings screen). */
function PersonalSettings({ fullName, email, role }: { fullName: string; email: string; role: string }) {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <SettingsProfileCard fullName={fullName} email={email} role={role} />
      <SettingsGroup title="Account">
        <SettingsLink href="/profile" icon="user" label="My Profile" hint="Your details, leave and claims" />
        <SettingsRow icon="globe" label="Language">
          <LanguageSwitcher align="right" />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Preferences">
        <SettingsRow icon="theme" label="Theme" hint="Light, Dark, or Auto (follows this phone or computer)">
          <ThemeSetting />
        </SettingsRow>
        <SettingsDisclosure icon="text" label="Display" hint="Font and text size">
          <DisplaySettings />
        </SettingsDisclosure>
        <SettingsDisclosure icon="bell" label="Notifications on this device">
          <PushToggle />
        </SettingsDisclosure>
      </SettingsGroup>
    </div>
  );
}

const KIND_LABEL: Record<StaffKind, string> = { local: "Local staff", foreign: "Foreign staff", none: "No staff record" };
const KIND_CLASS: Record<StaffKind, string> = { local: "bg-success-bg text-success", foreign: "bg-warning-bg text-warning", none: "bg-surface-alt text-text-muted" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ company?: string; team?: string; staff?: string; sort?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  if (session.role !== "super_admin" || !session.hasAllCompaniesAccess) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-[22px] font-extrabold text-text">Settings</h1>
        <PersonalSettings fullName={session.fullName} email={session.email} role={ROLE_LABEL[session.role]} />
        <p className="max-w-3xl px-1 text-[12.5px] text-text-muted">Only a Super Admin can manage team members.</p>
      </div>
    );
  }

  const everyone = await listMembers(supabase);

  // A company chosen in the side menu: only the staff of that company are listed (no mixing with the other companies).
  // They are the people given access to that company and the people whose staff record in that company is linked to their login.
  const { company: requestedId, team = "", staff = "", sort = "" } = await searchParams;
  const selected = companies.find((c) => c.id === requestedId);
  let members = everyone;
  let groups: { key: string; title: string; members: typeof everyone }[];
  if (selected) {
    const { data: linked } = await supabase.from("employees").select("user_id").eq("company_id", selected.id).not("user_id", "is", null);
    const linkedIds = new Set((linked ?? []).map((e) => e.user_id as string));
    members = everyone.filter((m) => linkedIds.has(m.id) || m.user_company_access.some((r) => r.company_id === selected.id));
    groups = members.length > 0 ? [{ key: selected.id, title: selected.name, members }] : [];
  } else {
    // All companies: a person who works in several companies is one account and is listed under each of their companies.
    // The people who can open every company (the Super Admins, the company admins) are listed first.
    groups = [
      { key: "all", title: "All Companies", members: everyone.filter((m) => m.user_company_access.some((r) => r.company_id === null) || m.user_company_access.length === 0) },
      ...companies.map((c) => ({ key: c.id, title: c.name, members: everyone.filter((m) => !m.user_company_access.some((r) => r.company_id === null) && m.user_company_access.some((r) => r.company_id === c.id)) })),
    ].filter((g) => g.members.length > 0);
  }

  // Local or foreign staff: from the staff record(s) linked to the login, read the way HR does (nationality, else a passport number instead of an IC).
  // A login with no linked staff record is "No staff record". A person with a foreign record in any company counts as foreign staff.
  const kindOf = new Map<string, StaffKind>();
  const nationalityOf = new Map<string, string>();
  {
    const { data: staffRows } = await supabase.from("employees").select("user_id, nationality, ic_passport_no").not("user_id", "is", null);
    for (const e of staffRows ?? []) {
      const id = e.user_id as string;
      const foreign = isForeigner(e);
      if (foreign || !kindOf.has(id)) kindOf.set(id, foreign ? "foreign" : "local");
      if (e.nationality?.trim() && (foreign || !nationalityOf.has(id))) nationalityOf.set(id, e.nationality.trim());
    }
  }
  const kind = (id: string): StaffKind => kindOf.get(id) ?? "none";

  // the filters: one company's group (or the people who can open every company), one kind of staff, and the order
  const groupCounts = groups.map((g) => ({ value: g.key, label: g.title, count: g.members.length }));
  // a company chosen here that is not listed (another company chosen in the side menu) is ignored
  const teamKey = groups.some((g) => g.key === team) ? team : "";
  const teamGroups = groups.filter((g) => !teamKey || g.key === teamKey);
  const inTeam = Array.from(new Map(teamGroups.flatMap((g) => g.members).map((m) => [m.id, m])).values());
  const kindCounts = [
    { value: "", label: "All", count: inTeam.length },
    ...(["local", "foreign", "none"] as StaffKind[]).map((k) => ({ value: k, label: KIND_LABEL[k], count: inTeam.filter((m) => kind(m.id) === k).length })),
  ];
  const kindRank = (id: string) => {
    const order: StaffKind[] = sort === "foreign" ? ["foreign", "local", "none"] : ["local", "foreign", "none"];
    return order.indexOf(kind(id));
  };
  groups = teamGroups
    .map((g) => {
      const list = g.members.filter((m) => !staff || kind(m.id) === staff);
      if (sort === "name") list.sort((a, b) => a.full_name.localeCompare(b.full_name));
      else if (sort === "local" || sort === "foreign") list.sort((a, b) => kindRank(a.id) - kindRank(b.id) || a.full_name.localeCompare(b.full_name));
      return { ...g, members: list };
    })
    .filter((g) => g.members.length > 0);
  const filtered = !!teamKey || !!staff;
  const shownCount = new Set(groups.flatMap((g) => g.members.map((m) => m.id))).size;

  // The password given when the account was made is shown only until the person signs in for the first time (and only if nobody has changed it since).
  const initialPasswords = await loadInitialPasswords(members);
  // the sub-categories (tabs) each member is limited to (null = no limit)
  const sectionsOf = new Map<string, string[] | null>();
  {
    const { data: sectionRows } = await (createAdminClient() as unknown as SupabaseClient).from("user_company_access").select("user_id, allowed_sections");
    const byUser = new Map<string, (string[] | null)[]>();
    for (const r of (sectionRows ?? []) as { user_id: string; allowed_sections: string[] | null }[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.allowed_sections]);
    for (const [id, list] of byUser) sectionsOf.set(id, mergeAllowedSections(list));
  }
  const withEmail = members.filter((m) => !!m.email && !m.email.endsWith(NO_EMAIL_DOMAIN)).length;
  const withoutEmail = members.length - withEmail;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[22px] font-extrabold text-text">Settings</h1>

      <PersonalSettings fullName={session.fullName} email={session.email} role={ROLE_LABEL[session.role]} />

      <div className="w-full max-w-3xl">
        <SettingsGroup title="Data Management">
          <DataManagement />
        </SettingsGroup>
      </div>

      <SettingsGroup title="Team" action={<AddMemberForm companies={companies} defaultCompanyId={selected?.id} />}>
        <div className="p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-secondary" aria-hidden="true">
            <circle cx="7.3" cy="7" r="2.7" /><path d="M2.5 16.2c.7-2.7 2.5-4.2 4.8-4.2s4.1 1.5 4.8 4.2" /><path d="M12.6 4.6a2.6 2.6 0 0 1 0 4.9M14.2 12.2c1.6.5 2.7 1.8 3.3 4" />
          </svg>
          <div>
            <div className="text-[14.5px] font-semibold text-text">{`Team Members (${members.length})`}</div>
            <div className="text-[12.5px] text-text-muted">Add, edit, or remove team members and their access — internal use only, no public sign-up.</div>
          </div>
        </div>
        {selected && (
          <p className="-mt-1 mb-2 text-[12.5px] text-text-secondary">
            <b className="text-text">{selected.name}</b> — only the staff of the company you chose are listed. Choose All Companies to see everyone.
          </p>
        )}
        <p className="-mt-1 mb-3 text-[12.5px] text-text-secondary">
          <b className="text-success">{withEmail} with email</b> · <b className={withoutEmail ? "text-warning" : "text-text-secondary"}>{withoutEmail} without email</b>. A person can sign in with the username or the email. Use Edit to add or change an email.
        </p>
        <TeamMemberFilters companies={[{ value: "", label: "All", count: members.length }, ...groupCounts]} kinds={kindCounts} team={teamKey} sort={sort} />
        {filtered && (
          <p className="mb-2 text-[12.5px] text-text-secondary">
            {`Showing ${shownCount} of ${members.length} people.`}
          </p>
        )}
        {members.length === 0 ? (
          <EmptyRow text={selected ? "No staff of this company yet." : "No one has access yet."} />
        ) : groups.length === 0 ? (
          <EmptyRow text="No one matches this filter." />
        ) : (
          <div className="-mx-5 -mb-5 flex flex-col">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="flex items-baseline gap-2 border-y border-border bg-surface-alt px-5 py-2.5">
                  <span className="text-[13px] font-extrabold text-text">{g.title}</span>
                  <span className="text-[12px] text-text-muted">{g.members.length} {g.members.length === 1 ? "person" : "people"}</span>
                </div>
                <div className="grid grid-cols-5 gap-4 border-b border-border px-5 py-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <div>Name / Email</div>
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
                        <span className={`mr-1.5 mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${KIND_CLASS[kind(m.id)]}`} title={nationalityOf.get(m.id) ?? undefined}>
                          {KIND_LABEL[kind(m.id)]}
                          {kind(m.id) === "foreign" && nationalityOf.get(m.id) ? ` · ${nationalityOf.get(m.id)}` : ""}
                        </span>
                        {hasEmail ? (
                          <div className="mt-0.5 break-all text-[12px] text-text-muted">{m.email}</div>
                        ) : (
                          <span className="mt-1 inline-block rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning">No email yet</span>
                        )}
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
                        {(m.can_view_main_dashboard || access?.role === "super_admin") && <div className="mt-0.5 text-[11.5px] font-semibold text-[#5f7a55]">Can view the Main Dashboard</div>}
                        {access?.allowed_modules && (
                          <div className="mt-0.5 text-[11.5px] text-text-muted">Modules: {access.allowed_modules.map((k) => ASSIGNABLE_MODULES.find((m) => m.key === k)?.label ?? k).join(", ")}</div>
                        )}
                        {sectionSummary(sectionsOf.get(m.id)).map((x) => (
                          <div key={x.module} className="mt-0.5 text-[11.5px] text-text-muted">
                            Only in {ASSIGNABLE_MODULES.find((a) => a.key === x.module)?.label ?? x.module}: {x.labels.join(", ")}
                          </div>
                        ))}
                      </div>
                      <MemberActions
                        userId={m.id}
                        companies={companies}
                        initial={{
                          fullName: m.full_name,
                          username: m.username ?? "",
                          email: hasEmail ? m.email : "",
                          role: access?.role ?? "staff",
                          allCompanies: hasAll,
                          companyIds: rows.map((r) => r.company_id).filter((id): id is string => id !== null),
                          allowedModules: access?.allowed_modules ?? null,
                          allowedSections: sectionsOf.get(m.id) ?? null,
                          canViewMainDashboard: m.can_view_main_dashboard,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        </div>
      </SettingsGroup>
    </div>
  );
}
