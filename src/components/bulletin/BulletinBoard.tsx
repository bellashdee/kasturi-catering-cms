"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AREA, BTN, BTN_GHOST, BTN_SM_GHOST, Dialog, FIELD, LABEL, Pill } from "@/components/priority/ui";
import { BULLETIN_CATEGORIES, BULLETIN_CATEGORY_LABEL, BULLETIN_CATEGORY_TONE, type BulletinCategory } from "@/lib/bulletin/constants";
import { createBulletinPost, deleteBulletinPost, setBulletinPinned, updateBulletinPost } from "@/lib/bulletin/actions";

export type BoardPost = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  title: string;
  body: string;
  category: BulletinCategory;
  pinned: boolean;
  expiresOn: string | null;
  expired: boolean;
  isNew: boolean;
  author: string | null;
  postedLabel: string;
  /** The signed-in person may change or delete this announcement. */
  editable: boolean;
};

export type PostableCompany = { id: string; name: string };

type Draft = { id: string | null; companyId: string; title: string; body: string; category: BulletinCategory; pinned: boolean; expiresOn: string };

export function BulletinBoard({ posts, postable, canPostAll, canPost }: { posts: BoardPost[]; postable: PostableCompany[]; canPostAll: boolean; canPost: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<BulletinCategory | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = posts.filter((p) => filter === "all" || p.category === filter);
  const defaultCompany = canPostAll ? "" : (postable[0]?.id ?? "");

  function run(task: () => Promise<void>, after?: () => void) {
    setError(null);
    start(async () => {
      try {
        await task();
        after?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function edit(p: BoardPost) {
    setError(null);
    setDraft({ id: p.id, companyId: p.companyId ?? "", title: p.title, body: p.body, category: p.category, pinned: p.pinned, expiresOn: p.expiresOn ?? "" });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...BULLETIN_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${filter === c ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}
          >
            {c === "all" ? "All news" : BULLETIN_CATEGORY_LABEL[c]}
          </button>
        ))}
        {canPost && (
          <button
            type="button"
            className={`${BTN} ml-auto`}
            onClick={() => {
              setError(null);
              setDraft({ id: null, companyId: defaultCompany, title: "", body: "", category: "company", pinned: false, expiresOn: "" });
            }}
          >
            + New announcement
          </button>
        )}
      </div>
      {error && !draft && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-[14px] text-text-muted">No announcements yet.</div>
      ) : (
        shown.map((p) => (
          <article key={p.id} className={`rounded-2xl border bg-surface p-5 shadow-sm ${p.pinned ? "border-[#e3c98a] bg-[#fffdf5]" : "border-border"} ${p.expired ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              {p.pinned && <Pill tone="warning">📌 Pinned</Pill>}
              {p.isNew && <Pill tone="danger">New</Pill>}
              <Pill tone={BULLETIN_CATEGORY_TONE[p.category]}>{BULLETIN_CATEGORY_LABEL[p.category]}</Pill>
              <Pill tone="neutral">{p.companyName ?? "All companies"}</Pill>
              {p.expired && <Pill tone="neutral">Expired</Pill>}
            </div>
            <h2 className="mt-2.5 text-[18px] font-extrabold text-text">{p.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-relaxed text-text">{p.body}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-text-muted">
              <span>{`${p.author ? `${p.author} · ` : ""}${p.postedLabel}${p.expiresOn ? ` · until ${p.expiresOn}` : ""}`}</span>
              {p.editable && (
                <span className="flex gap-1.5">
                  <button type="button" className={BTN_SM_GHOST} disabled={pending} onClick={() => run(() => setBulletinPinned(p.id, !p.pinned))}>
                    {p.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button type="button" className={BTN_SM_GHOST} onClick={() => edit(p)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={BTN_SM_GHOST}
                    disabled={pending}
                    onClick={() => window.confirm("Delete this announcement?") && run(() => deleteBulletinPost(p.id))}
                  >
                    Delete
                  </button>
                </span>
              )}
            </div>
          </article>
        ))
      )}

      {draft && (
        <Dialog title={draft.id ? "Edit announcement" : "New announcement"} onClose={() => setDraft(null)} wide>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const input = { companyId: draft.companyId || null, title: draft.title, body: draft.body, category: draft.category, pinned: draft.pinned, expiresOn: draft.expiresOn || null };
              run(() => (draft.id ? updateBulletinPost(draft.id, input) : createBulletinPost(input)), () => setDraft(null));
            }}
          >
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>For *</label>
                <select className={FIELD} value={draft.companyId} onChange={(e) => setDraft({ ...draft, companyId: e.target.value })}>
                  {canPostAll && <option value="">All companies</option>}
                  {postable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Category *</label>
                <select className={FIELD} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as BulletinCategory })}>
                  {BULLETIN_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {BULLETIN_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL}>Title *</label>
              <input required maxLength={150} className={FIELD} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div>
              <label className={LABEL}>Announcement *</label>
              <textarea required maxLength={4000} rows={7} className={AREA} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Show until (optional)</label>
                <input type="date" className={FIELD} value={draft.expiresOn} onChange={(e) => setDraft({ ...draft, expiresOn: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 self-end pb-2.5 text-[14px] font-semibold text-text">
                <input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} />
                <span>Pin to the top</span>
              </label>
            </div>
            <div className="flex justify-end gap-2.5">
              <button type="button" className={BTN_GHOST} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className={BTN} disabled={pending}>
                {pending ? "Saving…" : draft.id ? "Save" : "Post"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
