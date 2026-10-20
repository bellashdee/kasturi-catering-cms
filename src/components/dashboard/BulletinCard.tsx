import Link from "next/link";
import type { BulletinPost } from "@/lib/bulletin/queries";
import { BULLETIN_CATEGORY_LABEL, type BulletinCategory } from "@/lib/bulletin/constants";
import { formatMalaysiaDate } from "@/lib/format";

/** The latest announcements of the bulletin board on the main dashboard: every staff member sees the company and work news. */
export function BulletinCard({ posts, companyQuery = "" }: { posts: BulletinPost[]; companyQuery?: string }) {
  if (posts.length === 0) return null;
  return (
    <section aria-label="Bulletin" className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="text-[15px] font-bold text-text">📢 Bulletin Board</div>
        <Link href={`/bulletin${companyQuery}`} className="text-[13px] font-semibold text-primary hover:underline">
          See all news
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {posts.map((p) => (
          <li key={p.id} className="px-5 py-3">
            <Link href={`/bulletin${companyQuery}`} className="block">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
                {p.pinned && <span>📌</span>}
                {p.isNew && <span className="rounded-full bg-danger-bg px-2 py-0.5 font-bold text-danger">New</span>}
                <span className="font-semibold">{BULLETIN_CATEGORY_LABEL[p.category as BulletinCategory]}</span>
                <span>·</span>
                <span>{p.company_name ?? "All companies"}</span>
                <span>·</span>
                <span>{formatMalaysiaDate(p.created_at)}</span>
              </div>
              <div className="mt-0.5 text-[14.5px] font-bold text-text">{p.title}</div>
              <div className="mt-0.5 line-clamp-2 text-[13px] text-text-secondary">{p.body}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
