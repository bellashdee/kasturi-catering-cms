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

  // who is on approved leave: today, and the other days of the month shown (name and dates only, never the type or the reason)
  const today = todayInMalaysia();
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [ly, lm] = ym.split("-").map(Number);
  const monthEnd = `${ym}-${String(new Date(Date.UTC(ly, lm, 0)).getUTCDate()).padStart(2, "0")}`;
  type OnLeave = { employee_name: string; company_name: string; start_date: string; end_date: string };
  const { data: leaveRows } = await (supabase as unknown as { rpc: (fn: string, args: Record<string, string>) => Promise<{ data: OnLeave[] | null }> }).rpc("staff_on_leave", {
    from_date: `${ym}-01`,
    to_date: monthEnd,
  });
  const onLeave = (leaveRows ?? []).filter((l) => !requestedId || companies.find((c) => c.id === requestedId)?.name === l.company_name);
  const leaveToday = onLeave.filter((l) => l.start_date <= today && l.end_date >= today);
  const leaveLater = onLeave.filter((l) => !(l.start_date <= today && l.end_date >= today));
  const dates = (l: OnLeave) => (l.start_date === l.end_date ? formatMalaysiaDate(l.start_date) : `${formatMalaysiaDate(l.start_date)} – ${formatMalaysiaDate(l.end_date)}`);

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
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="text-[15px] font-extrabold text-text">Who is on leave</div>
        <div className="mt-2 text-[13.5px]">
          <span className="font-semibold text-text">Today: </span>
          {leaveToday.length === 0 ? (
            <span className="text-text-muted">nobody is on leave today.</span>
          ) : (
            leaveToday.map((l, i) => (
              <span key={`${l.employee_name}-${l.start_date}`} className="text-text">
                {i > 0 ? ", " : ""}
                <b>{l.employee_name}</b> <span className="text-text-muted">({l.company_name}, until {formatMalaysiaDate(l.end_date)})</span>
              </span>
            ))
          )}
        </div>
        {leaveLater.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-[13px] text-text-secondary">
            {leaveLater.map((l) => (
              <li key={`${l.employee_name}-${l.start_date}`}>
                <b className="text-text">{l.employee_name}</b> · {dates(l)} <span className="text-text-muted">· {l.company_name}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11.5px] text-text-muted">Approved leave of {monthLabel ?? "this month"} appears here by itself.</p>
      </section>
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
