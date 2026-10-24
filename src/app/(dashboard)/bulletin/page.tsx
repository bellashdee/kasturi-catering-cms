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

/** Bulletin board: company and work news for every staff member. Admins post; everybody reads. */
export default async function BulletinPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  const canPost = canPostBulletin(session.role);
  const postableIds = canPost ? await adminCompanyIds(supabase, companies.map((c) => c.id)) : [];
  const isSuper = session.role === "super_admin";
  const rows = await listBulletinPosts(supabase, targetCompanyIds, { includeExpired: canPost });

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
    editable: p.company_id ? postableIds.includes(p.company_id) : isSuper,
  }));

  return (
    <SoftPage>
      <SoftHeader title="Bulletin Board" subtitle="News about the company and the work, for every staff member." />
      <SoftGreeting name={session.fullName.split(" ")[0] ?? session.fullName} line="Stay in the know: the latest news is right here." dateLabel={formatMalaysiaLongDate()} />
      <BulletinBoard
        posts={posts}
        postable={companies.filter((c) => postableIds.includes(c.id)).map((c) => ({ id: c.id, name: c.name }))}
        canPostAll={isSuper}
        canPost={canPost && (isSuper || postableIds.length > 0)}
      />
    </SoftPage>
  );
}
