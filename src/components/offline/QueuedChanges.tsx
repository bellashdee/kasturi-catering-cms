"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { listConflicts, listOutbox, syncStore } from "@/lib/offline/sync";
import type { OfflineOp } from "@/lib/offline/types";

type Row = { id: string; title: string; detail?: string; state: "waiting" | "failed" | "conflict" };

/**
 * The changes of this page made offline that are not on the server yet (the list on the page only shows saved records). Hidden when
 * there are none. `recordId` limits it to one record (a detail page).
 */
export function QueuedChanges({ ops, recordId }: { ops: OfflineOp[]; recordId?: string }) {
  const { t } = useI18n();
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.server);
  const [rows, setRows] = useState<Row[]>([]);
  const key = ops.join(",");

  useEffect(() => {
    let live = true;
    const wanted = key.split(",");
    const mine = (m: { op: string; recordId: string }) => wanted.includes(m.op) && (!recordId || m.recordId === recordId);
    void Promise.all([listOutbox().catch(() => []), listConflicts().catch(() => [])]).then(([items, conflicts]) => {
      if (!live) return;
      setRows([
        ...items.filter(mine).map((i) => ({ id: i.id, title: i.label.title, detail: i.label.detail, state: i.status === "pending" ? ("waiting" as const) : ("failed" as const) })),
        ...conflicts.filter((c) => mine(c.mutation)).map((c) => ({ id: c.id, title: c.label.title, detail: c.label.detail, state: "conflict" as const })),
      ]);
    });
    return () => {
      live = false;
    };
  }, [key, recordId, s.pending, s.failed, s.conflicts, s.userId]);

  if (rows.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[13px] print:hidden" role="status">
      <div className="font-bold text-warning">{t("Made offline, not saved on the server yet")}</div>
      <ul className="mt-1 flex flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.id} className="text-text">
            <span className="font-semibold">{t(r.title)}</span>
            {r.detail ? <span className="text-text-secondary"> · {r.detail}</span> : null}
            <span className={r.state === "waiting" ? "text-text-secondary" : "font-semibold text-danger"}>
              {" "}· {r.state === "waiting" ? t("Waiting to send") : r.state === "failed" ? t("Not sent yet: see the sync status") : t("Conflict: choose in the sync status")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
