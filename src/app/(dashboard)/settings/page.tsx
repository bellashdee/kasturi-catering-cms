import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, ROLE_LABEL } from "@/lib/auth";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";

export default async function SettingsPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("user_company_access")
    .select("id, role, company_id, granted_at, profiles(full_name, email), companies(name)")
    .order("granted_at", { ascending: true });

  const access = rows ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Users &amp; Roles</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Who can access this system, and what they can see. Full invite &amp;
          permission editing comes in a later phase — this is a read-only
          foundation view for now.
        </p>
      </div>

      <SectionCard title="Team Members">
        {access.length === 0 ? (
          <EmptyRow text="No one has access yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {access.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">
                    {row.profiles?.full_name ?? "Unknown"}
                  </div>
                  <div className="text-xs text-text-muted">{row.profiles?.email}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-info-bg px-3 py-1 text-xs font-bold text-primary">
                    {ROLE_LABEL[row.role]}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {row.companies?.name ?? "All Companies"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
