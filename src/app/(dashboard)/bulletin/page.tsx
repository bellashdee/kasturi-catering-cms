import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { formatMalaysiaDate, formatMalaysiaDateTime, formatMalaysiaLongDate, todayInMalaysia } from "@/lib/format";
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

  // who is on approved leave TODAY (name, company and last day only, never the type or the reason); a day later they are gone from the list
  const today = todayInMalaysia();
  type OnLeave = { employee_name: string; company_name: string; start_date: string; end_date: string };
  const { data: leaveRows } = await (supabase as unknown as { rpc: (fn: string, args: Record<string, string>) => Promise<{ data: OnLeave[] | null }> }).rpc("staff_on_leave", {
    from_date: today,
    to_date: today,
  });
  const leaveToday = (leaveRows ?? []).filter((l) => (!requestedId || companies.find((c) => c.id === requestedId)?.name === l.company_name) && l.start_date <= today && l.end_date >= today);

  // the people who can be mentioned, and the reactions of the announcements shown
  const loose = supabase as unknown as { rpc: (fn: string) => Promise<{ data: { id: string; full_name: string }[] | null }>; from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: peopleRows }, { data: reactionRows }] = await Promise.all([
    loose.rpc("bulletin_people"),
    rows.length ? loose.from("bulletin_reactions").select("post_id, user_id, emoji").in("post_id", rows.map((p) => p.id)) : Promise.resolve({ data: [] }),
  ]);
  const people = (peopleRows ?? []).map((x) => ({ id: x.id, name: x.full_name }));
  const nameOf = new Map(people.map((x) => [x.id, x.name]));
  const reactionsOf = (postId: string) => {
    const list = ((reactionRows ?? []) as { post_id: string; user_id: string; emoji: string }[]).filter((r) => r.post_id === postId);
    const byEmoji = new Map<string, { count: number; mine: boolean }>();
    for (const r of list) {
      const e = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
      byEmoji.set(r.emoji, { count: e.count + 1, mine: e.mine || r.user_id === session.userId });
    }
    return Object.fromEntries(byEmoji);
  };

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
    mentions: (((p as unknown as { mentions?: string[] }).mentions) ?? []).map((id) => ({ id, name: nameOf.get(id) ?? "Staff" })),
    reactions: reactionsOf(p.id),
  }));

  return (
    <SoftPage>
      <SoftHeader title="Bulletin Board" subtitle="News about the company and the work, for every staff member." />
      <SoftGreeting fullName={session.fullName} line="Stay in the know: the latest news is right here." dateLabel={formatMalaysiaLongDate()} />
      <MonthFilter />
      {leaveToday.length > 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="text-[15px] font-extrabold text-text">On leave today</div>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13.5px]">
            {leaveToday.map((l) => (
              <li key={`${l.employee_name}-${l.start_date}`} className="flex flex-wrap items-baseline gap-x-2">
                <b className="text-text">{l.employee_name}</b>
                <span className="text-text-muted">
                  {l.company_name}
                  {l.end_date > today ? ` · back after ${formatMalaysiaDate(l.end_date)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="px-1 text-[12.5px] text-text-muted">Nobody is on leave today.</p>
      )}
      <BulletinBoard
        emptyText={monthLabel ? "No announcements in this month." : undefined}
        posts={posts}
        people={people}
        postable={companies.filter((c) => postableIds.includes(c.id)).map((c) => ({ id: c.id, name: c.name }))}
        canPostAll={isSuper}
        canPost={canPost && (isSuper || postableIds.length > 0)}
      />
    </SoftPage>
  );
}
