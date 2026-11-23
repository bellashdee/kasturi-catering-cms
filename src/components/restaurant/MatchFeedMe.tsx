"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyFeedMeMatches, previewFeedMeProducts, type MatchRow } from "@/lib/restaurant/menuActions";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/StatusBadge";
import { SPEND_HINT, SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

type Unlinked = { id: string; name: string; code: string };

/**
 * Brings the product names of FeedMe next to the menu: choose a FeedMe Excel (the Overview with its Top Products, or a product list), see which
 * product is which menu item, and link or create. Read only for FeedMe; a name already linked is never overwritten.
 */
export function MatchFeedMe({ companyId, unlinked, canEdit }: { companyId: string; unlinked: Unlinked[]; canEdit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<{ fileName: string; source: string; warning: string | null } | null>(null);
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ linked: number; created: number; skipped: string[] } | null>(null);

  async function read() {
    if (!file) {
      setError("Choose the FeedMe Excel file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("companyId", companyId);
      const r = await previewFeedMeProducts(fd);
      if (!r.ok) {
        setRows(null);
        setError(r.error);
        return;
      }
      setInfo({ fileName: r.fileName, source: r.source, warning: r.warning });
      setRows(r.rows);
      const initial: Record<string, string> = {};
      for (const row of r.rows) if (row.state === "suggest" && row.itemId) initial[row.key] = `link:${row.itemId}`;
      setChoice(initial);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!file || !rows) return;
    const picked = Object.entries(choice).filter(([, v]) => v);
    if (picked.length === 0) {
      setError("Choose at least one product to link or create.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("companyId", companyId);
      for (const [key, value] of picked) fd.append("choice", `${key}|${value}`);
      const r = await applyFeedMeMatches(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone({ linked: r.linked, created: r.created, skipped: r.skipped });
      setRows(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // an item can be linked to one product only: the ones already chosen are not offered again
  const taken = new Set(Object.values(choice).filter((v) => v.startsWith("link:")).map((v) => v.slice(5)));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border border-border bg-surface p-5 text-[13.5px] text-text-secondary shadow-sm">
        <div className="mb-1 text-[15px] font-bold text-text">How it works</div>
        <ol className="list-decimal pl-5">
          <li className="mb-1">Download an Excel from FeedMe: the Overview (Report → Overview → Download → Excel, its sheet Top Products lists the products sold), or a product list if the FeedMe Menu section can export one.</li>
          <li className="mb-1">Choose the file here and press Read the file. Nothing is saved yet.</li>
          <li className="mb-1">For each product choose the menu item it is, or create a new menu item, then press Save the choices.</li>
          <li>The menu item then carries the FeedMe product name, so its sales can be matched later. FeedMe itself is never changed, and a name already linked is never overwritten.</li>
        </ol>
      </div>

      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {done && (
        <div role="status" className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] text-success">
          <div className="font-semibold">{`Linked: ${done.linked}. Created: ${done.created}.`}</div>
          {done.skipped.length > 0 && <ul className="mt-1 list-disc pl-5">{done.skipped.map((s) => <li key={s}>{s}</li>)}</ul>}
        </div>
      )}

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <label className={SPEND_LABEL}>FeedMe Excel file (.xlsx) *</label>
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRows(null); setError(null); setDone(null); }} className={`${SPEND_INPUT} h-auto py-2`} />
        <div className={SPEND_HINT}>Up to about 900 KB</div>
        <button type="button" disabled={busy || !file} onClick={read} className={`mt-3 ${SPEND_SAVE_BTN}`}>{busy && !rows ? "Reading..." : "Read the file"}</button>
      </div>

      {rows && info && (
        <div className="rounded-3xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3.5">
            <div className="text-[15px] font-bold text-text">Products in the file: nothing is saved yet</div>
            <div className="mt-0.5 text-[12.5px] text-text-secondary">{`${info.fileName} · read from ${info.source}`}</div>
            {info.warning && <div className="mt-1 text-[12.5px] text-warning">{info.warning}</div>}
          </div>
          <div className="overflow-x-auto p-2 sm:p-4">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-muted">
                  <th className="px-2 py-2 font-semibold">FeedMe product</th>
                  <th className="px-2 py-2 text-right font-semibold">Sold</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 font-semibold">Menu item</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border align-top last:border-0">
                    <td className="px-2 py-2 font-semibold">{r.name}</td>
                    <td className="px-2 py-2 text-right text-text-secondary">{r.qty ?? "—"}</td>
                    <td className="px-2 py-2">
                      {r.state === "linked" && <StatusBadge tone="success">Already linked</StatusBadge>}
                      {r.state === "suggest" && <StatusBadge tone="info">Same name as a menu item</StatusBadge>}
                      {r.state === "new" && <StatusBadge tone="warning">Not in the menu</StatusBadge>}
                    </td>
                    <td className="px-2 py-2">
                      {r.state === "linked" ? (
                        <span className="text-text-secondary">{r.itemName}</span>
                      ) : canEdit ? (
                        <Select value={choice[r.key] ?? ""} onChange={(e) => setChoice((c) => ({ ...c, [r.key]: e.target.value }))} className="h-9 w-72 max-w-full rounded-lg border border-border-strong bg-white px-2 text-[13px]">
                          <option value="">— skip —</option>
                          <option value="create">Create a new menu item</option>
                          {unlinked.filter((u) => !taken.has(u.id) || choice[r.key] === `link:${u.id}`).map((u) => <option key={u.id} value={`link:${u.id}`}>{`Link to: ${u.name} (${u.code})`}</option>)}
                        </Select>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
              <button type="button" disabled={busy} onClick={save} className={SPEND_SAVE_BTN}>{busy ? "Saving..." : "Save the choices"}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
