import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { formatMalaysiaDateTime } from "@/lib/format";
import { canPostBulletin } from "@/lib/bulletin/constants";
import { listBulletinPosts } from "@/lib/bulletin/queries";
import { BulletinBoard, type BoardPost } from "@/components/bulletin/BulletinBoard";

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
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Bulletin Board</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">News about the company and the work, for every staff member.</p>
      </div>
      <BulletinBoard
        posts={posts}
        postable={companies.filter((c) => postableIds.includes(c.id)).map((c) => ({ id: c.id, name: c.name }))}
        canPostAll={isSuper}
        canPost={canPost && (isSuper || postableIds.length > 0)}
      />
    </div>
  );
}
