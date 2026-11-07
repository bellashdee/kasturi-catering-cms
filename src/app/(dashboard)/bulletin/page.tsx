import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { formatMalaysiaDateTime, formatMalaysiaLongDate } from "@/lib/format";
import { canPostBulletin } from "@/lib/bulletin/constants";
import { listBulletinPosts } from "@/lib/bulletin/queries";
import { BulletinBoard, type BoardPost } from "@/components/bulletin/BulletinBoard";
import { SoftGreeting, SoftHeader, SoftPage } from "@/components/ui/Soft";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";

/** Bulletin board: company and work news for every staff member. Admins post; everybody reads. */
export default async function BulletinPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const { company: requestedId, month } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  // every local (Malaysian) staff member may post, edit and delete; the admins as before
  const { data: localStaff } = await supabase.rpc("user_is_local_staff");
  const isLocal = localStaff === true;
  const isAdmin = canPostBulletin(session.role);
  const canPost = isAdmin || isLocal;
  const adminIds = isAdmin ? await adminCompanyIds(supabase, companies.map((c) => c.id)) : [];
  const postableIds = isLocal ? companies.map((c) => c.id) : adminIds;
  const isSuper = session.role === "super_admin" || isLocal;
  // the month is the month the announcement was posted in
  const rows = filterByMonth(await listBulletinPosts(supabase, targetCompanyIds, { includeExpired: canPost }), month, (p) => p.created_at);
  const monthLabel = monthLabelOf(month);

  const posts: BoardPost[] = rows.map((p) => ({
    id: p.id,
    companyId: p.company_id,
    companyName: p.company_name,
    title: p.title,
    body: p.body,
    category: p.category as BoardPost["category"],
    pinned: p.pinned,
    expiresOn: p.expires_on,
    expired: p.expired,
    isNew: p.isNew,
    author: p.created_by_name,
    postedLabel: formatMalaysiaDateTime(p.created_at),
    editable: isLocal || (p.company_id ? adminIds.includes(p.company_id) : session.role === "super_admin"),
  }));

  return (
    <SoftPage>
      <SoftHeader title="Bulletin Board" subtitle="News about the company and the work, for every staff member." />
      <SoftGreeting fullName={session.fullName} line="Stay in the know: the latest news is right here." dateLabel={formatMalaysiaLongDate()} />
      <MonthFilter />
      <BulletinBoard
        emptyText={monthLabel ? "No announcements in this month." : undefined}
        posts={posts}
        postable={companies.filter((c) => postableIds.includes(c.id)).map((c) => ({ id: c.id, name: c.name }))}
        canPostAll={isSuper}
        canPost={canPost && (isSuper || postableIds.length > 0)}
      />
    </SoftPage>
  );
}
